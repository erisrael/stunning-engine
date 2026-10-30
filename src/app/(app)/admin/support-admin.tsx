"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/app/status-pill";
import { saveChatConfigAction, deleteConversationAction } from "@/app/actions/chat-plus";
import { answerFeedbackAction, handleReportAction } from "@/app/actions/support";
import type { ChatConfig } from "@/server/chat-extras";

const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${(b / 1048576).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Usage = { total: number; byKind: { kind: string; bytes: number; files: number }[]; byUser: { name: string; bytes: number }[]; chats: { id: string; name: string; kind: string; bytes: number; messages: number }[]; messages: number; groups: number };

// ---------------------------------------------------------------------------
// Chat: limits, storage, auto-delete, and deleting chats
// ---------------------------------------------------------------------------

export function ChatAdmin({ config, usage, hardMaxMb }: { config: ChatConfig; usage: Usage; hardMaxMb: number }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const num = (k: keyof ChatConfig, label: string, hint: string, max?: number) => (
    <div className="space-y-1">
      <Label htmlFor={`cc-${k}`}>{label}</Label>
      <Input id={`cc-${k}`} type="number" min={0} max={max} value={String(c[k])} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  const quota = c.quotaMb * 1048576;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Limits and auto-delete</CardTitle>
            <CardDescription>Apply to every chat. 0 means no limit, or keep for ever.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              {num("maxFileMb", "Largest file (MB)", `At most ${hardMaxMb} MB with the current storage.`, hardMaxMb)}
              {num("quotaMb", "Total chat storage (MB)", "Uploads stop when it is full.")}
              {num("perUserQuotaMb", "Storage per person (MB)", "Counts the files each person sent.")}
              {num("fileRetentionDays", "Delete files after (days)", "Older files are removed for good.")}
              {num("messageRetentionDays", "Delete messages after (days)", "Pinned messages are kept.")}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2">
                <Switch checked={c.voiceAutoDelete} onCheckedChange={(v) => setC({ ...c, voiceAutoDelete: v })} /> Voice messages delete themselves
              </label>
              {c.voiceAutoDelete && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {num("voiceMinutes", "Minutes after first played", "Then the voice message is gone.")}
                  {num("voiceUnplayedDays", "Days if never played", "Unplayed ones are removed after this.")}
                </div>
              )}
              <label className="flex items-center gap-2">
                <Switch checked={c.allowGifs} onCheckedChange={(v) => setC({ ...c, allowGifs: v })} /> Allow GIFs
              </label>
            </div>
            <Button
              onClick={async () => {
                const r = await saveChatConfigAction(c);
                if (!r.ok) return void toast.error(r.error);
                setC(r.data as ChatConfig);
                toast.success("Chat settings saved");
                router.refresh();
              }}
            >
              Save chat settings
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>
              {usage.messages.toLocaleString()} messages in {usage.groups} chats. {mb(usage.total)} of files{quota ? ` of ${mb(quota)}` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {quota > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (usage.total / quota) * 100)}%` }} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {usage.byKind.map((k) => (
                <div key={k.kind} className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground capitalize">{k.kind}</div>
                  <div className="font-semibold">{mb(k.bytes)}</div>
                  <div className="text-xs text-muted-foreground">{k.files} files</div>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Most storage</p>
              {usage.byUser.map((u) => (
                <div key={u.name} className="flex justify-between">
                  <span>{u.name}</span>
                  <span className="tabular text-muted-foreground">{mb(u.bytes)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Chats</CardTitle>
          <CardDescription>Delete a whole chat with its messages and files. Direct chats are named by their two people; their content is encrypted and not shown.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chat</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.chats.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="capitalize">{g.kind}</TableCell>
                  <TableCell className="text-right tabular">{g.messages}</TableCell>
                  <TableCell className="text-right tabular">{mb(g.bytes)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-[var(--st-blocked-fg)]"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${g.name}" for everyone, with all messages and files? This cannot be undone.`)) return;
                        const r = await deleteConversationAction(g.id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Chat deleted");
                        router.refresh();
                      }}
                    >
                      <Trash2Icon /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

type FeedbackRow = { id: string; category: string; message: string; page: string | null; status: string; reply: string | null; created_at: string; name: string | null; replier: string | null };

export function FeedbackAdmin({ rows, categories, statuses }: { rows: FeedbackRow[]; categories: Record<string, string>; statuses: Record<string, string> }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, { status: string; reply: string }>>({});
  const [filter, setFilter] = React.useState("open");
  const shown = rows.filter((r) => filter === "all" || (filter === "open" ? !["done", "closed"].includes(r.status) : r.status === filter));
  return (
    <div className="space-y-3">
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-48" aria-label="Show">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Still open</SelectItem>
          <SelectItem value="all">Everything</SelectItem>
          {Object.entries(statuses).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shown.map((f) => {
        const d = draft[f.id] ?? { status: f.status, reply: "" };
        return (
          <Card key={f.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {categories[f.category] ?? f.category}
                <StatusPill size="xs" tone={f.status === "new" ? "paused" : f.status === "done" ? "done" : "neutral"} label={statuses[f.status] ?? f.status} />
              </CardTitle>
              <CardDescription>
                {f.name ?? "Someone"} · {when(f.created_at)}
                {f.page ? ` · from ${f.page}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="whitespace-pre-wrap">{f.message}</p>
              {f.reply && (
                <p className="rounded bg-muted px-3 py-2 text-xs">
                  Reply{f.replier ? ` by ${f.replier}` : ""}: {f.reply}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Select value={d.status} onValueChange={(v) => setDraft({ ...draft, [f.id]: { ...d, status: v } })}>
                  <SelectTrigger className="w-40" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statuses).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={d.reply} onChange={(e) => setDraft({ ...draft, [f.id]: { ...d, reply: e.target.value } })} placeholder="Reply (they are told)" className="min-w-60 flex-1" aria-label="Reply" />
                <Button
                  size="sm"
                  onClick={async () => {
                    const r = await answerFeedbackAction(f.id, d);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success("Saved; they are told");
                    router.refresh();
                  }}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!shown.length && <p className="text-sm text-muted-foreground">Nothing here.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Safety reports
// ---------------------------------------------------------------------------

type ReportRow = {
  id: string;
  target_type: string;
  target_label: string | null;
  reason: string;
  details: string | null;
  evidence: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  reporter: string | null;
  handler: string | null;
  message_body: string | null;
  message_encrypted: number | null;
};

export function ReportsAdmin({ rows, reasons, statuses }: { rows: ReportRow[]; reasons: Record<string, string>; statuses: Record<string, string> }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, { status: string; resolution: string; deleteMessage: boolean; deactivateUser: boolean }>>({});
  const [showClosed, setShowClosed] = React.useState(false);
  const shown = rows.filter((r) => showClosed || r.status === "open" || r.status === "reviewing");
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(v === true)} /> Show handled reports
      </label>
      {shown.map((r) => {
        const d = draft[r.id] ?? { status: r.status === "open" ? "reviewing" : r.status, resolution: r.resolution ?? "", deleteMessage: false, deactivateUser: false };
        const set = (p: Partial<typeof d>) => setDraft({ ...draft, [r.id]: { ...d, ...p } });
        return (
          <Card key={r.id} className={r.status === "open" ? "border-[var(--st-blocked-fg)]/40" : ""}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {reasons[r.reason] ?? r.reason}
                <StatusPill size="xs" tone={r.status === "open" ? "blocked" : r.status === "reviewing" ? "paused" : "neutral"} label={statuses[r.status] ?? r.status} />
              </CardTitle>
              <CardDescription>
                About: {r.target_label ?? r.target_type} · reported by {r.reporter ?? "someone"} on {when(r.created_at)}
                {r.handler ? ` · handled by ${r.handler}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.details && <p className="whitespace-pre-wrap">{r.details}</p>}
              {r.target_type === "message" && (r.evidence || (r.message_body && !r.message_encrypted)) && (
                <blockquote className="border-l-4 border-[var(--st-blocked-fg)]/50 bg-muted px-3 py-2 text-xs whitespace-pre-wrap">{r.evidence ?? r.message_body}</blockquote>
              )}
              {r.target_type === "message" && r.message_encrypted === 1 && !r.evidence && <p className="text-xs text-muted-foreground">The message is in an encrypted chat and the reporter did not include its text.</p>}
              {r.resolution && <p className="rounded bg-muted px-3 py-2 text-xs">Outcome: {r.resolution}</p>}
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <Select value={d.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statuses).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea value={d.resolution} onChange={(e) => set({ resolution: e.target.value })} rows={1} placeholder="What was done (the reporter sees this)" aria-label="Outcome" />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (d.deactivateUser && !window.confirm("Deactivate this account? They are signed out everywhere.")) return;
                    const res = await handleReportAction(r.id, d);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success("Saved");
                    router.refresh();
                  }}
                >
                  Save
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {r.target_type === "message" && (
                  <label className="flex items-center gap-1.5">
                    <Checkbox checked={d.deleteMessage} onCheckedChange={(v) => set({ deleteMessage: v === true })} /> Delete the message
                  </label>
                )}
                {(r.target_type === "message" || r.target_type === "user") && (
                  <label className="flex items-center gap-1.5">
                    <Checkbox checked={d.deactivateUser} onCheckedChange={(v) => set({ deactivateUser: v === true })} /> Deactivate the account
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!shown.length && <p className="text-sm text-muted-foreground">No open reports.</p>}
    </div>
  );
}
