"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleXIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, MultiSelect } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/primitives";
import {
  deleteEmailTemplateAction,
  deleteSenderAction,
  emailLogAction,
  previewEmailAction,
  previewRecipientsAction,
  resendFailedAction,
  saveEmailTemplateAction,
  saveSenderAction,
  saveSmtpAction,
  sendEmailAction,
  testSmtpAction,
} from "@/app/actions/email";
import type { EmailLogRow, EmailTemplate, LogFilter, Recipient, Sender, SendMode, SmtpSettings } from "@/server/email";
import { ROLE_LABELS, ROLES, STAGE_LABELS, STAGES, type Role } from "@/lib/domain";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; roles: Role[] };
type Preset = { key: string; label: string; host: string; port: number; secure: boolean; hint: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  sending: { label: "Sending", tone: "active" },
  sent: { label: "Sent", tone: "done" },
  partial: { label: "Partly sent", tone: "paused" },
  failed: { label: "Failed", tone: "blocked" },
};

const PLACEHOLDERS = ["first_name", "name", "email", "role", "sender_name", "date"];

// Splits on commas, semicolons and new lines, but not inside "quoted names" or <addresses>.
function splitEmails(v: string) {
  return (v.match(/(?:"[^"]*"|<[^>]*>|[^,;\n"<])+/g) ?? []).map((x) => x.trim()).filter(Boolean);
}

export function EmailClient(props: {
  tab: "compose" | "sent" | "templates" | "settings";
  canManage: boolean;
  viewer: { id: string; name: string; email: string };
  smtp: SmtpSettings;
  senders: Sender[];
  allSenders: Sender[];
  templates: EmailTemplate[];
  people: Person[];
  groups: { id: string; name: string; kind: string }[];
  log: EmailLogRow[];
  filter: LogFilter;
  presets: Preset[];
  secretSource: string;
  tz: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const [draft, setDraft] = React.useState<{ subject: string; body: string } | null>(null);
  const ready = props.smtp.source !== "none";
  return (
    <Tabs value={props.tab} onValueChange={(v) => go({ tab: v === "compose" ? null : v })} className="gap-4">
      <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
        <TabsTrigger value="compose">Compose</TabsTrigger>
        <TabsTrigger value="sent">Sent</TabsTrigger>
        <TabsTrigger value="templates">Templates ({props.templates.length})</TabsTrigger>
        {props.canManage && <TabsTrigger value="settings">Settings</TabsTrigger>}
      </TabsList>
      {!ready && (
        <div className="rounded-lg border border-[var(--st-paused-fg)]/40 bg-[var(--st-paused-bg)] p-3 text-sm text-[var(--st-paused-fg)]">
          Email is not set up yet. {props.canManage ? "Add the SMTP account in Settings." : "Ask an administrator to add the SMTP account."}
        </div>
      )}
      <TabsContent value="compose">
        <Compose {...props} draft={draft} onDraftUsed={() => setDraft(null)} ready={ready} />
      </TabsContent>
      <TabsContent value="sent">
        <SentLog {...props} go={go} />
      </TabsContent>
      <TabsContent value="templates">
        <Templates
          templates={props.templates}
          viewerId={props.viewer.id}
          canManage={props.canManage}
          onUse={(t) => {
            setDraft({ subject: t.subject, body: t.body });
            go({ tab: null });
          }}
        />
      </TabsContent>
      {props.canManage && (
        <TabsContent value="settings">
          <EmailSettings smtp={props.smtp} senders={props.allSenders} people={props.people} presets={props.presets} secretSource={props.secretSource} viewerEmail={props.viewer.email} />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function Compose({
  viewer,
  senders,
  templates,
  people,
  groups,
  draft,
  onDraftUsed,
  ready,
}: {
  viewer: { id: string; name: string; email: string };
  senders: Sender[];
  templates: EmailTemplate[];
  people: Person[];
  groups: { id: string; name: string; kind: string }[];
  draft: { subject: string; body: string } | null;
  onDraftUsed: () => void;
  ready: boolean;
}) {
  const router = useRouter();
  const [senderId, setSenderId] = React.useState<string>(senders[0]?.id ?? "default");
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [leads, setLeads] = React.useState<string[]>([]);
  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [emails, setEmails] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [mode, setMode] = React.useState<SendMode>("individual");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [recipients, setRecipients] = React.useState<{ list: Recipient[]; invalid: string[] } | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState<"send" | "test" | "check" | null>(null);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!draft) return;
    setSubject(draft.subject);
    setBody(draft.body);
    onDraftUsed();
  }, [draft, onDraftUsed]);

  const to = { userIds, roles, leads, groupIds, emails: splitEmails(emails) };
  const anyRecipient = userIds.length + roles.length + leads.length + groupIds.length + splitEmails(emails).length > 0;
  const totalSize = files.reduce((n, f) => n + f.size, 0);
  // Recipients change: the checked list is out of date.
  React.useEffect(() => setRecipients(null), [userIds, roles, leads, groupIds, emails]);

  const check = async () => {
    setBusy("check");
    const r = await previewRecipientsAction(to);
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    setRecipients(r.data!);
    return r.data!;
  };
  const insert = (token: string) => {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? body.length;
    setBody(body.slice(0, at) + `{{${token}}}` + body.slice(at));
    requestAnimationFrame(() => el?.focus());
  };
  const send = async (test: boolean) => {
    setBusy(test ? "test" : "send");
    try {
      if (totalSize > 10 * 1024 * 1024) throw new Error("Attachments are limited to 10 MB in total.");
      const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, base64: await fileToBase64(f) })));
      const r = await sendEmailAction({
        senderId: senderId === "default" ? null : senderId,
        to: test ? { emails: [viewer.email] } : to,
        cc: test || mode === "individual" ? [] : splitEmails(cc),
        bcc: test || mode === "individual" ? [] : splitEmails(bcc),
        subject: test ? `[Test] ${subject}` : subject,
        body,
        mode: test ? "individual" : mode,
        attachments,
      });
      if (!r.ok) throw new Error(r.error);
      const { sent, failed } = r.data as { sent: number; failed: number };
      if (failed) toast.warning(`${sent} sent, ${failed} failed`, { description: "See Sent for the reasons; you can resend to those that failed." });
      else toast.success(test ? `Test sent to ${viewer.email}` : `Sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}`);
      if (!test) {
        setConfirm(false);
        setUserIds([]);
        setRoles([]);
        setLeads([]);
        setGroupIds([]);
        setEmails("");
        setCc("");
        setBcc("");
        setSubject("");
        setBody("");
        setFiles([]);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
                    </SelectItem>
                  ))}
                  {!senders.length && <SelectItem value="default">The organisation&apos;s address</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select
                value=""
                onValueChange={(id) => {
                  const t = templates.find((x) => x.id === id);
                  if (!t) return;
                  setSubject(t.subject);
                  setBody(t.body);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={templates.length ? "Start from a template" : "No templates yet"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <UsersIcon className="size-4" /> To
            </p>
            <div className="flex flex-wrap gap-2">
              <MultiSelect label="People" options={people.map((p) => ({ value: p.id, label: p.name, hint: p.roles.map((r) => ROLE_LABELS[r]).join(", ") }))} value={userIds} onChange={setUserIds} />
              <MultiSelect label="Everyone with role" options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} value={roles} onChange={setRoles} />
              <MultiSelect label="Team leads" options={STAGES.map((s) => ({ value: s, label: `${STAGE_LABELS[s]} leads` }))} value={leads} onChange={setLeads} />
              {groups.length > 0 && <MultiSelect label="Chat group members" options={groups.map((g) => ({ value: g.id, label: g.name, hint: g.kind === "channel" ? "channel" : undefined }))} value={groupIds} onChange={setGroupIds} />}
            </div>
            <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Other addresses, separated by commas: partner@school.org, Abebe <abebe@example.com>" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="xs" variant="outline" disabled={!anyRecipient || !!busy} onClick={check}>
                {busy === "check" ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Check recipients
              </Button>
              {recipients && (
                <span className={recipients.invalid.length ? "text-destructive" : "text-muted-foreground"}>
                  {recipients.list.length} {recipients.list.length === 1 ? "address" : "addresses"}
                  {recipients.invalid.length > 0 && ` · not valid: ${recipients.invalid.join(", ")}`}
                </span>
              )}
            </div>
            {recipients && recipients.list.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs">
                {recipients.list.map((r) => (
                  <span key={r.address} className="mr-2 inline-block">
                    {r.name ? `${r.name} <${r.address}>` : r.address}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>How to send</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["individual", "One email each", "Personal: each person gets their own copy with their name filled in."],
                  ["bcc", "Hidden list (BCC)", "One email; recipients do not see each other."],
                  ["together", "Together", "One email; everyone sees who else got it and can reply to all."],
                ] as [SendMode, string, string][]
              ).map(([k, label, hint]) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={cn("rounded-lg border p-2 text-left text-sm", mode === k ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </div>
          {mode !== "individual" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CC</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Addresses, separated by commas" />
              </div>
              <div className="space-y-1.5">
                <Label>BCC</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Addresses, separated by commas" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Recording schedule for next week" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Message</Label>
              <div className="flex flex-wrap gap-1">
                {PLACEHOLDERS.map((p) => (
                  <button key={p} type="button" onClick={() => insert(p)} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted/70">
                    {`{{${p}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Textarea ref={bodyRef} rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hello {{first_name}},\n\nThe recording plan for next week is ready.\n\n**Monday**: Grade 7 Maths, Unit 3\n\nThanks,\n{{sender_name}}"} />
            <p className="text-xs text-muted-foreground">
              Formatting: **bold**, *italic*, lists with -, links [text](https://...). {mode !== "individual" && "Name placeholders are left empty in a shared email; use One email each for personal greetings."}
            </p>
          </div>

          <div className="space-y-1.5">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                setFiles((f) => [...f, ...[...(e.target.files ?? [])]].slice(0, 10));
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <PaperclipIcon /> Attach
              </Button>
              {files.map((f, i) => (
                <span key={f.name + i} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {f.name} ({Math.ceil(f.size / 1024)} KB)
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
              {totalSize > 10 * 1024 * 1024 && <span className="text-xs text-destructive">Over the 10 MB limit</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              disabled={!ready || !!busy || !anyRecipient || !subject.trim() || !body.trim()}
              onClick={async () => {
                const r = recipients ?? (await check());
                if (r && !r.invalid.length && r.list.length) setConfirm(true);
              }}
            >
              <SendIcon /> Send
            </Button>
            <Button variant="outline" disabled={!ready || !!busy || !subject.trim() || !body.trim()} onClick={() => send(true)}>
              {busy === "test" ? <Loader2Icon className="animate-spin" /> : <MailIcon />} Send me a test
            </Button>
            <Button
              variant="outline"
              disabled={!body.trim()}
              onClick={async () => {
                const r = await previewEmailAction(body, { name: viewer.name, email: viewer.email });
                if (!r.ok) return toast.error(r.error);
                setPreview(r.data as string);
              }}
            >
              <EyeIcon /> Preview
            </Button>
            <Button variant="ghost" disabled={!subject.trim() || !body.trim()} onClick={() => setSaveOpen(true)}>
              <FileTextIcon /> Save as template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Good to know</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>Replies go to the address you send from.</p>
          <p>Gmail allows about 500 recipients a day; Google Workspace and Zoho allow more. Up to 300 recipients per email here.</p>
          <p>Large lists send a few at a time. If some fail, open the email in Sent and resend to just those.</p>
          <p>Attachments are sent but not kept, so a resend goes without them.</p>
        </CardContent>
      </Card>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to {recipients?.list.length} recipients?</DialogTitle>
            <DialogDescription>
              {mode === "individual" ? "Each person gets their own copy." : mode === "bcc" ? "One email; recipients do not see each other." : "One email; everyone sees the full list."} Subject: {subject}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button disabled={busy === "send"} onClick={() => send(false)}>
              {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{subject || "Preview"}</DialogTitle>
            <DialogDescription>As {viewer.name} would see it.</DialogDescription>
          </DialogHeader>
          <iframe title="Email preview" sandbox="" srcDoc={preview ?? ""} className="h-[60vh] w-full rounded-lg border bg-white" />
        </DialogContent>
      </Dialog>

      {saveOpen && <TemplateDialog template={{ id: "", name: subject, subject, body, shared: true }} onClose={() => setSaveOpen(false)} onSaved={() => (setSaveOpen(false), router.refresh())} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent log
// ---------------------------------------------------------------------------

function SentLog({ log, filter, canManage, people, tz, go }: { log: EmailLogRow[]; filter: LogFilter; canManage: boolean; people: Person[]; tz: string; go: (p: Record<string, string | null>) => void }) {
  const [q, setQ] = React.useState(filter.q ?? "");
  const [open, setOpen] = React.useState<string | null>(null);
  const sortBy = (k: NonNullable<LogFilter["sort"]>) => go({ sort: k, dir: filter.sort === k && filter.dir === "desc" ? "asc" : "desc" });
  const Head = ({ k, children, className }: { k: NonNullable<LogFilter["sort"]>; children: React.ReactNode; className?: string }) => (
    <th className={cn("p-2 font-medium", className)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
        {children}
        {filter.sort === k ? filter.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
      </button>
    </th>
  );
  const exportCsv = () => {
    const head = ["Sent", "Subject", "From", "Sent by", "How", "Recipients", "Delivered", "Failed", "Status", "Error"];
    const lines = log.map((l) => [fmtDateTime(l.created_at, tz), l.subject, l.from_address, l.sent_by_name ?? "", l.mode, l.recipient_count, l.sent_count, l.failed_count, STATUS[l.status]?.label ?? l.status, l.error ?? ""]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject or recipient" className="h-8 w-56 pl-7 text-sm" />
        </form>
        <Select value={filter.status ?? "all"} onValueChange={(v) => go({ status: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial">Partly sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <>
            <Combobox size="sm" className="h-8 w-44 text-xs" options={people.map((p) => ({ value: p.id, label: p.name }))} value={filter.sender ?? null} onChange={(v) => go({ sender: v })} placeholder="Anyone" />
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={!!filter.mine} onCheckedChange={(v) => go({ mine: v ? "1" : null })} /> Only mine
            </label>
          </>
        )}
        <Input type="date" aria-label="From date" value={filter.from ?? ""} onChange={(e) => go({ from: e.target.value || null })} className="h-8 w-36 text-xs" />
        <Input type="date" aria-label="To date" value={filter.to ?? ""} onChange={(e) => go({ to: e.target.value || null })} className="h-8 w-36 text-xs" />
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv} disabled={!log.length}>
          <DownloadIcon /> Export
        </Button>
      </div>
      {!log.length ? (
        <EmptyState icon={<MailIcon className="size-5" />} title="No emails" description="Emails you send appear here with what happened for each recipient." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <Head k="subject">Subject</Head>
                <th className="p-2 font-medium">From</th>
                <Head k="recipients">Recipients</Head>
                <Head k="failed">Status</Head>
                <Head k="created">Sent</Head>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpen(l.id)}>
                  <td className="max-w-[360px] truncate p-2 font-medium">{l.subject}</td>
                  <td className="p-2 text-xs">
                    {l.from_address}
                    {l.sent_by_name && <span className="block text-muted-foreground">by {l.sent_by_name}</span>}
                  </td>
                  <td className="p-2 text-xs tabular">
                    {l.recipient_count}
                    <span className="block text-muted-foreground">{l.mode === "individual" ? "one each" : l.mode === "bcc" ? "hidden list" : "together"}</span>
                  </td>
                  <td className="p-2">
                    <Badge variant="secondary" style={{ background: `var(--st-${STATUS[l.status]?.tone ?? "neutral"}-bg)`, color: `var(--st-${STATUS[l.status]?.tone ?? "neutral"}-fg)` }}>
                      {STATUS[l.status]?.label ?? l.status}
                    </Badge>
                    {l.failed_count > 0 && <span className="block text-[11px] text-destructive">{l.failed_count} failed</span>}
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap" title={fmtDateTime(l.created_at, tz)}>
                    {fmtRelative(l.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <LogDetail id={open} tz={tz} onClose={() => setOpen(null)} />}
    </div>
  );
}

type LogDetailData = EmailLogRow & { body: string; attachments: { name: string; size: number }[]; recipients: { address: string; kind: string; name: string | null; status: string; error: string | null; sent_at: string | null }[] };

function LogDetail({ id, tz, onClose }: { id: string; tz: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = React.useState<LogDetailData | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void emailLogAction(id).then((r) => (r.ok ? setData(r.data as LogDetailData) : toast.error(r.error)));
  }, [id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.subject ?? "Email"}</DialogTitle>
          {data && (
            <DialogDescription>
              From {data.from_address}
              {data.sent_by_name ? ` by ${data.sent_by_name}` : ""}, {fmtDateTime(data.created_at, tz)}
            </DialogDescription>
          )}
        </DialogHeader>
        {!data ? (
          <Loader2Icon className="mx-auto size-5 animate-spin" />
        ) : (
          <div className="space-y-3">
            <pre className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-3 font-sans text-sm whitespace-pre-wrap">{data.body}</pre>
            {data.attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <PaperclipIcon className="inline size-3" /> {data.attachments.map((a) => a.name).join(", ")}
              </p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <tbody>
                  {data.recipients.map((r) => (
                    <tr key={r.address + r.kind} className="border-t first:border-t-0">
                      <td className="p-1.5">
                        {r.status === "sent" ? <CheckCircle2Icon className="size-3.5 text-[var(--st-done-fg)]" /> : r.status === "failed" ? <CircleXIcon className="size-3.5 text-destructive" /> : <Loader2Icon className="size-3.5" />}
                      </td>
                      <td className="p-1.5">
                        {r.name ? `${r.name} ` : ""}
                        <span className="text-muted-foreground">&lt;{r.address}&gt;</span>
                        {r.kind !== "to" && <span className="ml-1 uppercase text-muted-foreground">{r.kind}</span>}
                      </td>
                      <td className="p-1.5 text-muted-foreground">{r.error ?? (r.sent_at ? fmtDateTime(r.sent_at, tz) : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {data && data.failed_count > 0 && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await resendFailedAction(id);
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                const d = r.data as { sent: number; failed: number };
                toast[d.failed ? "warning" : "success"](`${d.sent} sent${d.failed ? `, ${d.failed} failed again` : ""}`);
                onClose();
                router.refresh();
              }}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Resend to {data.failed_count} failed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function Templates({ templates, viewerId, canManage, onUse }: { templates: EmailTemplate[]; viewerId: string; canManage: boolean; onUse: (t: EmailTemplate) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string; subject: string; body: string; shared: boolean } | null>(null);
  const shown = templates.filter((t) => !q || `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="h-8 w-56 pl-7 text-sm" />
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: "", name: "", subject: "", body: "", shared: true })}>
          <PlusIcon /> New template
        </Button>
      </div>
      {!shown.length ? (
        <EmptyState icon={<FileTextIcon className="size-5" />} title="No templates" description="Save emails you send often, such as weekly schedules or welcome messages." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => {
            const mine = t.createdBy === viewerId || canManage;
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <CardDescription className="truncate">{t.subject}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">{t.body}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.shared ? "Shared" : "Only me"}
                    {t.createdByName && ` · ${t.createdByName}`}
                  </p>
                  <div className="flex gap-1">
                    <Button size="xs" onClick={() => onUse(t)}>
                      <SendIcon /> Use
                    </Button>
                    {mine && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => setEditing({ id: t.id, name: t.name, subject: t.subject, body: t.body, shared: t.shared })}>
                          <PencilIcon /> Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            if (!window.confirm(`Delete the template "${t.name}"?`)) return;
                            const r = await deleteEmailTemplateAction(t.id);
                            if (!r.ok) return toast.error(r.error);
                            router.refresh();
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <TemplateDialog template={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), router.refresh())} />}
    </div>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: { id: string; name: string; subject: string; body: string; shared: boolean }; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = React.useState(template);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template.id ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Placeholders such as {"{{first_name}}"} are filled in for each recipient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Weekly recording plan" />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={10} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={t.shared} onCheckedChange={(v) => setT({ ...t, shared: v })} /> Shared with everyone who sends email
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !t.name.trim() || !t.subject.trim() || !t.body.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await saveEmailTemplateAction({ id: t.id || undefined, name: t.name, subject: t.subject, body: t.body, shared: t.shared });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Template saved");
              onSaved();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Settings: SMTP account and sender addresses
// ---------------------------------------------------------------------------

function EmailSettings({ smtp, senders, people, presets, secretSource, viewerEmail }: { smtp: SmtpSettings; senders: Sender[]; people: Person[]; presets: Preset[]; secretSource: string; viewerEmail: string }) {
  const router = useRouter();
  const fromEnv = smtp.source === "env";
  const [f, setF] = React.useState({ host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, password: "", fromName: smtp.fromName, fromAddress: smtp.fromAddress, replyTo: smtp.replyTo });
  const [preset, setPreset] = React.useState<string>(presets.find((p) => p.host && p.host === smtp.host)?.key ?? "custom");
  const [testTo, setTestTo] = React.useState(viewerEmail);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Sender | "new" | null>(null);
  const hint = presets.find((p) => p.key === preset)?.hint;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email account (SMTP)</CardTitle>
          <CardDescription>
            {fromEnv
              ? "Set in the hosting environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). Change it there."
              : "The account the app sends through. Gmail works with an app password; Google Workspace and Zoho work with your own domain."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!fromEnv && (
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={preset}
                onValueChange={(v) => {
                  setPreset(v);
                  const p = presets.find((x) => x.key === v);
                  if (p && p.host) setF((x) => ({ ...x, host: p.host, port: p.port, secure: p.secure }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1.5">
              <Label>Server</Label>
              <Input disabled={fromEnv} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input disabled={fromEnv} type="number" value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch disabled={fromEnv} checked={f.secure} onCheckedChange={(v) => setF({ ...f, secure: v })} /> Encrypted connection from the start (port 465). Off uses STARTTLS (port 587).
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sign-in name</Label>
              <Input disabled={fromEnv} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} placeholder="team@yourdomain.com" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>Password or app password</Label>
              <Input
                disabled={fromEnv}
                type="password"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                placeholder={smtp.hasPassword ? "Saved; type to replace" : ""}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Default sender name</Label>
              <Input disabled={fromEnv} value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default sender address</Label>
              <Input disabled={fromEnv} value={f.fromAddress} onChange={(e) => setF({ ...f, fromAddress: e.target.value })} placeholder="team@yourdomain.com" />
            </div>
          </div>
          {!fromEnv && (
            <div className="space-y-1.5">
              <Label>Reply-to (optional)</Label>
              <Input value={f.replyTo} onChange={(e) => setF({ ...f, replyTo: e.target.value })} placeholder="Where replies to the default address go" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Passwords are stored encrypted{secretSource === "APP_SECRET" ? " with the key in APP_SECRET." : ". Set APP_SECRET in the hosting settings to keep the key outside the database (then enter the passwords again)."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!fromEnv && (
              <Button
                disabled={!!busy}
                onClick={async () => {
                  setBusy("save");
                  const r = await saveSmtpAction({ ...f, password: f.password || null });
                  setBusy(null);
                  if (!r.ok) return toast.error(r.error);
                  toast.success("Email settings saved");
                  setF({ ...f, password: "" });
                  router.refresh();
                }}
              >
                {busy === "save" && <Loader2Icon className="animate-spin" />} Save
              </Button>
            )}
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} className="w-56" aria-label="Send the test to" />
            <Button
              variant="outline"
              disabled={!!busy || smtp.source === "none"}
              onClick={async () => {
                setBusy("test");
                const r = await testSmtpAction(null, testTo);
                setBusy(null);
                if (!r.ok) return toast.error(r.error, { duration: 12000 });
                toast.success(`Test email sent to ${testTo}`);
              }}
            >
              {busy === "test" ? <Loader2Icon className="animate-spin" /> : <MailIcon />} Send a test
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sender addresses</CardTitle>
          <CardDescription>
            Each employee&apos;s own address. Create the mailbox at your email provider first, then add it here, either with its own sign-in or as an address the main account is allowed to send as (an alias).
            People with a sender address send from it; others use the default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" onClick={() => setEditing("new")}>
            <PlusIcon /> Add sender address
          </Button>
          {senders.length ? (
            <ul className="divide-y rounded-lg border">
              {senders.map((s) => (
                <li key={s.id} className={cn("flex items-center gap-2 px-3 py-2", !s.active && "opacity-60")}>
                  <MailIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.userName ? `For ${s.userName}` : "Shared"} · {s.ownLogin ? "own sign-in" : "alias of the main account"}
                      {s.isDefault && " · default"}
                      {!s.active && " · off"}
                    </span>
                  </span>
                  <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEditing(s)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-destructive"
                    aria-label="Remove"
                    onClick={async () => {
                      if (!window.confirm(`Remove ${s.address}? The mailbox itself is not deleted.`)) return;
                      const r = await deleteSenderAction(s.id);
                      if (!r.ok) return toast.error(r.error);
                      router.refresh();
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No sender addresses yet. Everyone sends from the default address.</p>
          )}
        </CardContent>
      </Card>
      {editing && <SenderDialog sender={editing === "new" ? null : editing} people={people} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), router.refresh())} />}
    </div>
  );
}

function SenderDialog({ sender, people, onClose, onSaved }: { sender: Sender | null; people: Person[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({
    address: sender?.address ?? "",
    displayName: sender?.displayName ?? "",
    userId: sender?.userId ?? null,
    ownLogin: sender?.ownLogin ?? false,
    smtpUser: sender?.smtpUser ?? "",
    password: "",
    isDefault: sender?.isDefault ?? false,
    active: sender?.active ?? true,
  });
  const [busy, setBusy] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sender ? "Edit sender address" : "Add sender address"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="abebe@yourdomain.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Name shown</Label>
              <Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="Abebe Kebede" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Belongs to</Label>
            <Combobox options={people.map((p) => ({ value: p.id, label: p.name }))} value={f.userId} onChange={(v) => setF({ ...f, userId: v })} placeholder="Shared (no one person)" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={f.ownLogin} onCheckedChange={(v) => setF({ ...f, ownLogin: v })} />
            <span>
              Signs in with its own password
              <span className="block text-xs text-muted-foreground">Off: sent through the main account as an alias (the provider must allow it).</span>
            </span>
          </label>
          {f.ownLogin && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sign-in name</Label>
                <Input value={f.smtpUser} onChange={(e) => setF({ ...f, smtpUser: e.target.value })} placeholder={f.address || "Usually the address"} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>Password or app password</Label>
                <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={sender?.ownLogin ? "Saved; type to replace" : ""} autoComplete="new-password" />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.isDefault} onCheckedChange={(v) => setF({ ...f, isDefault: v })} /> Default for everyone else
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Active
            </label>
          </div>
          {sender && (
            <div className="flex gap-2">
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send a test to" />
              <Button
                variant="outline"
                disabled={!testTo}
                onClick={async () => {
                  const r = await testSmtpAction(sender.id, testTo);
                  if (!r.ok) return toast.error(r.error, { duration: 12000 });
                  toast.success("Test sent");
                }}
              >
                Test
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !f.address.trim() || (f.ownLogin && !sender?.ownLogin && !f.password)}
            onClick={async () => {
              setBusy(true);
              const r = await saveSenderAction({
                id: sender?.id,
                address: f.address,
                displayName: f.displayName,
                userId: f.userId,
                smtpUser: f.ownLogin ? f.smtpUser : null,
                password: f.ownLogin ? f.password || null : null,
                clearLogin: !f.ownLogin,
                isDefault: f.isDefault,
                active: f.active,
              });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Sender saved");
              onSaved();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
