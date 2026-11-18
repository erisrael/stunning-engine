"use client";

// The SMS console (Update 1.2, System improvements 5): compose with a live preview, character and part count and the
// estimated cost before sending; the full sending history with delivery status, parts, cost and failure reasons;
// and usage and spend per day and provider, with each provider's price per part.
import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, ClockIcon, DownloadIcon, Loader2Icon, RefreshCwIcon, SearchIcon, SendIcon, SmartphoneIcon, XCircleIcon, BanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, KeyValue, MetricCard, Meter } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import { smsCount } from "@/lib/sms-segments";
import * as A from "@/app/actions/sms-console";
import type { smsConsole, estimateSms, smsHistory, smsUsage, HistoryQuery } from "@/server/sms-console";

type Data = Awaited<ReturnType<typeof smsConsole>>;
type Estimate = Awaited<ReturnType<typeof estimateSms>>;
type History = Awaited<ReturnType<typeof smsHistory>>;
type Usage = Awaited<ReturnType<typeof smsUsage>>;
const ROUTE = "__route";
const ALL = "__all";
const money = (n: number, cur: string) => `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${cur}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : "");
const day = (offset: number) => new Date(Date.now() + 3 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);

// --- Compose ---------------------------------------------------------------------------

export function SmsCompose({ data, onSent }: { data: Data; onSent?: (batch: string) => void }) {
  const [numbers, setNumbers] = React.useState("");
  const [groups, setGroups] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [purpose, setPurpose] = React.useState<"alerts" | "marketing">("alerts");
  const [provider, setProvider] = React.useState<string>(ROUTE);
  const [sender, setSender] = React.useState("");
  const [est, setEst] = React.useState<Estimate | null>(null);
  const [estError, setEstError] = React.useState<string | null>(null);
  const [estimating, setEstimating] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const count = smsCount(message);
  const input = React.useMemo(() => ({ numbers, groups, message, purpose, sender: sender.trim() || null, connectorId: provider === ROUTE ? null : provider }), [numbers, groups, message, purpose, sender, provider]);

  React.useEffect(() => {
    if (!data.providers.length) return;
    let live = true;
    setEstimating(true);
    const t = setTimeout(async () => {
      const r = await A.estimateSmsAction(input);
      if (!live) return;
      setEstimating(false);
      if (r.ok) {
        setEst(r.data!);
        setEstError(null);
      } else setEstError(r.error);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [input, data.providers.length]);

  const send = async () => {
    setConfirm(false);
    setSending(true);
    const r = await A.sendSmsBatchAction(input);
    setSending(false);
    if (!r.ok) return toast.error(r.error);
    const d = r.data!;
    if (d.failed) toast.warning(`${d.sent} accepted, ${d.failed} could not be sent. See History for the reasons.`);
    else toast.success(`Sent to ${d.sent} ${d.sent === 1 ? "person" : "people"}. Delivery reports follow in History.`);
    setNumbers("");
    setGroups([]);
    setMessage("");
    onSent?.(d.id);
  };

  if (!data.providers.length) return <EmptyState title="No SMS provider is connected" description="Connect AfroMessage, Africa's Talking, Twilio or i-Conic under Connections, then come back to send." />;
  const ready = !!est && est.recipients > 0 && !!message.trim() && !est.tooMany;
  const senderShown = sender.trim() || est?.sender || data.purposes.find((p) => p.key === purpose)?.sender || "MySeed";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-sms-compose>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="sms-numbers">Recipients</Label>
          <Textarea id="sms-numbers" rows={3} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={"0911 234 567, +251 922 345 678\nOne per line or separated by commas; a name after the number is kept."} />
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1" role="group" aria-label="Recipient groups">
            {data.groups.map((g) => (
              <label key={g.key} className={cn("flex items-center gap-2 text-sm", !g.count && "opacity-50")}>
                <Checkbox checked={groups.includes(g.key)} disabled={!g.count} onCheckedChange={(c) => setGroups((x) => (c ? [...x, g.key] : x.filter((k) => k !== g.key)))} data-sms-group={g.key} />
                {g.label} <span className="tabular-nums text-muted-foreground">({g.count.toLocaleString()})</span>
              </label>
            ))}
          </div>
        </div>
        {data.templates.length > 0 && (
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select onValueChange={(k) => setMessage(data.templates.find((t) => t.key === k)?.text ?? "")}>
              <SelectTrigger aria-label="Template" className="w-full sm:w-72">
                <SelectValue placeholder="Start from a template" />
              </SelectTrigger>
              <SelectContent>
                {data.templates.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="sms-message">Message</Label>
          <Textarea id="sms-message" rows={5} maxLength={900} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write the message" />
          <div className="flex flex-wrap justify-between gap-2 text-xs tabular-nums text-muted-foreground" data-sms-counter={count.segments}>
            <span>
              {count.characters} characters · {count.encoding}
              {count.encoding === "UCS-2" ? " (Amharic, emoji and some symbols use 70 a part)" : ""}
            </span>
            <span>
              {count.segments} {count.segments === 1 ? "part" : "parts"} · {count.remaining} left in this part
            </span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as "alerts" | "marketing")}>
              <SelectTrigger aria-label="Purpose" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.purposes.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger aria-label="Provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROUTE}>As routed (with fallback)</SelectItem>
                {data.providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-sender">Sender ID</Label>
            <Input id="sms-sender" value={sender} maxLength={11} onChange={(e) => setSender(e.target.value)} placeholder={est?.sender ?? "As routed"} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/40 p-4" aria-label="Message preview" data-sms-preview>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <SmartphoneIcon className="size-3.5" /> {senderShown}
          </p>
          <div className="max-w-[16rem] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-background px-3 py-2 text-sm shadow-sm">{message || <span className="text-muted-foreground">Your message appears here.</span>}</div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4" data-sms-estimate aria-busy={estimating}>
          <h3 className="text-sm font-semibold">Before sending</h3>
          {estError ? (
            <p className="text-sm text-destructive">{estError}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Recipients</dt>
              <dd className="text-right tabular-nums" data-sms-recipients={est?.recipients ?? 0}>
                {(est?.recipients ?? 0).toLocaleString()}
              </dd>
              <dt className="text-muted-foreground">SMS parts in all</dt>
              <dd className="text-right tabular-nums" data-sms-parts={est?.parts ?? 0}>
                {(est?.parts ?? 0).toLocaleString()}
              </dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="truncate text-right">{est?.provider.name ?? ""}</dd>
              <dt className="text-muted-foreground">Price a part</dt>
              <dd className="text-right tabular-nums">{est?.price ? money(est.price.perPart, est.price.currency) : "Not set"}</dd>
              <dt className="font-medium">Estimated cost</dt>
              <dd className="text-right font-semibold tabular-nums" data-sms-cost={est?.cost ?? ""}>
                {est?.cost !== null && est?.cost !== undefined && est.price ? money(est.cost, est.price.currency) : "Set the price under Usage & costs"}
              </dd>
            </dl>
          )}
          {est?.price && <p className="text-xs text-muted-foreground">Price from: {est.price.source}</p>}
          {!!est?.invalid.length && (
            <p className="text-xs text-destructive" data-sms-invalid>
              Not a phone number, left out: {est.invalid.slice(0, 5).join(", ")}
              {est.invalid.length > 5 ? ` and ${est.invalid.length - 5} more` : ""}
            </p>
          )}
          {est?.tooMany && <p className="text-xs text-destructive">Send to at most 2,000 people at a time.</p>}
          <Button className="w-full" disabled={!ready || sending || estimating} onClick={() => setConfirm(true)} data-sms-send>
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {est?.recipients ? `Send to ${est.recipients.toLocaleString()} ${est.recipients === 1 ? "person" : "people"}` : "Send"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {est?.recipients.toLocaleString()} {est?.recipients === 1 ? "person" : "people"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {est?.parts.toLocaleString()} SMS parts through {est?.provider.name}
              {est?.cost !== null && est?.cost !== undefined && est.price ? `, about ${money(est.cost, est.price.currency)}` : ""}. Messages go out as soon as you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => void send()} data-sms-confirm>
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- History ---------------------------------------------------------------------------

const STATUS = {
  delivered: { label: "Delivered", icon: CheckCircle2Icon, cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  pending: { label: "Pending", icon: ClockIcon, cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  failed: { label: "Failed", icon: XCircleIcon, cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" },
  rejected: { label: "Rejected", icon: BanIcon, cls: "border-red-500/40 bg-transparent text-red-700 dark:text-red-300" },
} as const;
function StatusBadge({ s }: { s: keyof typeof STATUS }) {
  const x = STATUS[s];
  return (
    <Badge variant="outline" className={cn("gap-1", x.cls)}>
      <x.icon className="size-3" /> {x.label}
    </Badge>
  );
}

export function SmsHistory({ providers, batch }: { providers: Data["providers"]; batch?: string | null }) {
  const [f, setF] = React.useState<HistoryQuery>({ page: 1, size: 25, batch: batch ?? null });
  const [q, setQ] = React.useState("");
  const [data, setData] = React.useState<History | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState<History["rows"][number] | null>(null);
  const load = React.useCallback(async (x: HistoryQuery) => {
    setLoading(true);
    const r = await A.smsHistoryAction(x);
    setLoading(false);
    if (r.ok) setData(r.data!);
    else toast.error(r.error);
  }, []);
  React.useEffect(() => void load(f), [f, load]);
  React.useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [q]);
  const exportCsv = async () => {
    const r = await A.exportSmsHistoryAction(f);
    if (!r.ok) return toast.error(r.error);
    const url = URL.createObjectURL(new Blob([r.data!.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.data!.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 pb-16" data-sms-history>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, name, message or provider id" aria-label="Search messages" className="pl-8" />
        </div>
        <Select value={f.status ?? ALL} onValueChange={(v) => setF((x) => ({ ...x, page: 1, status: v === ALL ? null : v }))}>
          <SelectTrigger aria-label="Status" className="w-[9.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.provider ?? ALL} onValueChange={(v) => setF((x) => ({ ...x, page: 1, provider: v === ALL ? null : v }))}>
          <SelectTrigger aria-label="Provider" className="w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any provider</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="From" className="w-[9.5rem]" value={f.from ?? ""} onChange={(e) => setF((x) => ({ ...x, page: 1, from: e.target.value || null }))} />
        <Input type="date" aria-label="Until" className="w-[9.5rem]" value={f.until ?? ""} onChange={(e) => setF((x) => ({ ...x, page: 1, until: e.target.value || null }))} />
        <Button variant="outline" size="icon" aria-label="Reload" onClick={() => void load(f)}>
          <RefreshCwIcon className={cn(loading && "animate-spin")} />
        </Button>
        <Button variant="outline" onClick={() => void exportCsv()} data-sms-export>
          <DownloadIcon /> Export
        </Button>
      </div>
      {f.batch && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Showing one batch.
          <button type="button" className="underline" onClick={() => setF((x) => ({ ...x, batch: null, page: 1 }))}>
            Show all
          </button>
        </p>
      )}
      <div className={cn("overflow-x-auto rounded-xl border bg-card", loading && "opacity-60")}>
        {data && data.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Parts</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)} data-sms-row={r.status}>
                  <TableCell className="whitespace-nowrap tabular-nums">{when(r.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="block tabular-nums">{r.to_phone}</span>
                    {r.recipient_name && <span className="block text-xs text-muted-foreground">{r.recipient_name}</span>}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground">{r.preview ?? (r.purpose === "otp" ? "Sign-in code (not kept)" : "")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.provider ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.segments}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{r.cost !== null && r.currency ? money(r.cost, r.currency) : "-"}</TableCell>
                  <TableCell>
                    <StatusBadge s={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title={data ? "No messages match" : "Loading"} description={data ? "Messages sent from here and by the system appear here with their delivery status." : undefined} />
        )}
      </div>
      {data && (
        <div className="flex items-center justify-between text-sm">
          <span className="tabular-nums text-muted-foreground" data-sms-total={data.total}>
            {data.total.toLocaleString()} messages
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setF((x) => ({ ...x, page: data.page - 1 }))}>
              Previous
            </Button>
            <span className="tabular-nums">
              Page {data.page} of {data.pages}
            </span>
            <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setF((x) => ({ ...x, page: data.page + 1 }))}>
              Next
            </Button>
          </div>
        </div>
      )}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="tabular-nums">{open.to_phone}</SheetTitle>
                <SheetDescription>{open.recipient_name ?? "SMS"}</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4 pb-6 text-sm" data-sms-detail>
                <StatusBadge s={open.status} />
                {open.error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive" data-sms-reason>
                    {open.error}
                  </p>
                )}
                <KeyValue label="Message">{open.preview ? `${open.preview}${open.length > 60 ? "..." : ""}` : "Not kept"}</KeyValue>
                <KeyValue label="Queued">{when(open.created_at)}</KeyValue>
                <KeyValue label="Accepted by the provider">{when(open.sent_at) || "Not yet"}</KeyValue>
                <KeyValue label="Delivered">{when(open.delivered_at) || "No delivery report yet"}</KeyValue>
                <KeyValue label="Provider">{open.provider ?? "None accepted it"}</KeyValue>
                <KeyValue label="Provider's status">{open.report_status ?? open.stage}</KeyValue>
                <KeyValue label="Provider's message id">{open.provider_id ?? "-"}</KeyValue>
                <KeyValue label="Parts and encoding">{`${open.segments} (${open.encoding ?? "GSM-7"}), ${open.length} characters`}</KeyValue>
                <KeyValue label="Cost">{open.cost !== null && open.currency ? money(open.cost, open.currency) : "No price set when sent"}</KeyValue>
                <KeyValue label="Tries">{String(open.attempts)}</KeyValue>
                <KeyValue label="Sender">{open.sender ?? "Provider default"}</KeyValue>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --- Usage, costs and prices -----------------------------------------------------------

export function SmsUsage({ providers }: { providers: Data["providers"] }) {
  const [range, setRange] = React.useState({ from: day(-29), until: day(0) });
  const [data, setData] = React.useState<Usage | null>(null);
  React.useEffect(() => {
    let live = true;
    void A.smsUsageAction(range).then((r) => live && (r.ok ? setData(r.data!) : toast.error(r.error)));
    return () => {
      live = false;
    };
  }, [range]);
  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.days.map((d) => d.messages) ?? [1]));
  return (
    <div className="space-y-4 pb-16" data-sms-usage>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">From</Label>
          <Input type="date" aria-label="Usage from" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-[9.5rem]" />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Until</Label>
          <Input type="date" aria-label="Usage until" value={range.until} onChange={(e) => setRange((r) => ({ ...r, until: e.target.value }))} className="w-[9.5rem]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-sms-usage-totals>
        <MetricCard label="Messages" value={(t?.messages ?? 0).toLocaleString()} hint={`${(t?.parts ?? 0).toLocaleString()} SMS parts`} />
        <MetricCard label="Delivery rate" value={data?.deliveryRate !== null && data?.deliveryRate !== undefined ? `${data.deliveryRate}%` : "No reports"} hint={`${(t?.delivered ?? 0).toLocaleString()} delivered of those reported`} />
        <MetricCard label="Pending" value={(t?.pending ?? 0).toLocaleString()} hint="Sent, no delivery report yet" />
        <MetricCard label="Spend" value={data?.costs.length ? data.costs.map((c) => money(c.amount, c.currency)).join(" + ") : "No priced messages"} hint={`${(t?.failed ?? 0).toLocaleString()} failed, ${(t?.rejected ?? 0).toLocaleString()} rejected`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">By day</h3>
          {data?.days.length ? (
            <ul className="space-y-1.5">
              {data.days.slice(-14).map((d) => (
                <li key={d.day} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">{d.day.slice(5)}</span>
                  <Meter value={d.messages} max={maxDay} tone={d.failed > d.messages / 2 ? "danger" : "primary"} />
                  <span className="text-right">{d.messages}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing sent in this range.</p>
          )}
        </section>
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">By provider</h3>
          {data?.providers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.providers.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.messages}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.currency ? money(p.cost, p.currency) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No provider was used in this range.</p>
          )}
        </section>
      </div>
      {!!data?.batches.length && (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Sends from the console</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Estimated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.batches.map((b) => (
                  <TableRow key={b.id} data-sms-batch={b.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{when(b.created_at)}</TableCell>
                    <TableCell className="max-w-[16rem] truncate">{b.preview}</TableCell>
                    <TableCell>{b.by_name ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.recipients}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.sent}
                      {b.failed ? <span className="text-destructive"> ({b.failed} failed)</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.est_cost !== null && b.currency ? money(b.est_cost, b.currency) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      <SmsPrices providers={providers} />
    </div>
  );
}

function SmsPrices({ providers }: { providers: Data["providers"] }) {
  const [rows, setRows] = React.useState(() => Object.fromEntries(providers.map((p) => [p.id, { perPart: p.price ? String(p.price.perPart) : "", currency: p.price?.currency ?? "ETB", source: p.price?.source ?? "" }])));
  const [busy, setBusy] = React.useState<string | null>(null);
  const save = async (id: string) => {
    const r = rows[id];
    setBusy(id);
    const res = await A.saveSmsPriceAction(id, r.perPart.trim() === "" ? null : { perPart: Number(r.perPart), currency: r.currency, source: r.source || null });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data ? "Price saved." : "Price cleared.");
  };
  const live = async (id: string) => {
    setBusy(id);
    const res = await A.refreshLivePriceAction(id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    const p = res.data!;
    setRows((x) => ({ ...x, [id]: { perPart: String(p.perPart), currency: p.currency, source: p.source } }));
    toast.success(`Twilio's price: ${money(p.perPart, p.currency)} a part.`);
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" data-sms-prices>
      <div>
        <h3 className="text-sm font-semibold">Price per SMS part</h3>
        <p className="text-xs text-muted-foreground">Costs are parts times this price. Twilio&apos;s comes from its Pricing API; AfroMessage, Africa&apos;s Talking and i-Conic publish no pricing API, so enter the rate from your price list or contract.</p>
      </div>
      {providers.map((p) => (
        <div key={p.id} className="grid items-end gap-2 sm:grid-cols-[10rem_8rem_6rem_minmax(0,1fr)_auto]" data-sms-price={p.name}>
          <span className="pb-2 text-sm font-medium">{p.name}</span>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Per part</Label>
            <Input inputMode="decimal" aria-label={`${p.name} price per part`} value={rows[p.id].perPart} onChange={(e) => setRows((x) => ({ ...x, [p.id]: { ...x[p.id], perPart: e.target.value } }))} placeholder="0.25" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Currency</Label>
            <Input aria-label={`${p.name} currency`} maxLength={3} value={rows[p.id].currency} onChange={(e) => setRows((x) => ({ ...x, [p.id]: { ...x[p.id], currency: e.target.value.toUpperCase() } }))} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">From</Label>
            <Input aria-label={`${p.name} price source`} value={rows[p.id].source} onChange={(e) => setRows((x) => ({ ...x, [p.id]: { ...x[p.id], source: e.target.value } }))} placeholder="Price list, November 2026" />
          </div>
          <div className="flex gap-2">
            {p.livePricing && (
              <Button variant="outline" size="sm" disabled={busy === p.id} onClick={() => void live(p.id)}>
                Get Twilio&apos;s price
              </Button>
            )}
            <Button size="sm" disabled={busy === p.id} onClick={() => void save(p.id)} data-sms-price-save>
              {busy === p.id ? <Loader2Icon className="animate-spin" /> : null} Save
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

// The SMS tab's sections, switched in place so a send can open its batch in History.
export function SmsConsole({ data, setup, initial }: { data: Data; setup: React.ReactNode; initial: "compose" | "history" | "usage" | "setup" }) {
  const [tab, setTab] = React.useState(initial);
  const [batch, setBatch] = React.useState<string | null>(null);
  const tabs = [
    { key: "compose", label: "Compose" },
    { key: "history", label: "History" },
    { key: "usage", label: "Usage & costs" },
    { key: "setup", label: "Setup" },
  ] as const;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="SMS sections" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key !== "history") setBatch(null);
              try {
                const u = new URL(window.location.href);
                u.searchParams.set("sms", t.key);
                window.history.replaceState(null, "", u);
              } catch {
                // the address is only a convenience
              }
            }}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", tab === t.key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "compose" && (
        <SmsCompose
          data={data}
          onSent={(id) => {
            setBatch(id);
            setTab("history");
          }}
        />
      )}
      {tab === "history" && <SmsHistory key={batch ?? "all"} providers={data.providers} batch={batch} />}
      {tab === "usage" && <SmsUsage providers={data.providers} />}
      {tab === "setup" && setup}
    </div>
  );
}
