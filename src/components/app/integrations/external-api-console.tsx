"use client";

// Admin, External APIs: one place per outside system Myseed calls or is called by. Each provider shows whether it is
// set up and working (from its latest calls), its settings with their own Save, the tools to test it, and its latest
// calls and callbacks from the call monitor. Keys never reach the browser: a saved key shows as saved, a blank field
// keeps it, and removing it is a separate choice.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  CirclePauseIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getMyseedVerifyConfigAction, saveMyseedVerifyConfigAction, testMyseedVerifyConnectionAction, createVerifyPaymentRequestAction } from "@/app/actions/myseed-verify";
import { saveExternalApiConfigAction, testExternalApiAction, fetchIconicSmsStatusAction, apiProviderStatusAction } from "@/app/actions/external-api";
import { checkLegacyCmsAuthAction } from "@/app/actions/legacy-cms";
import { listChapaAccountsAction, saveChapaAccountAction, deleteChapaAccountAction, testChapaAccountAction, fetchChapaBalancesAction, listChapaTransactionsAction, clearAllChapaAccountsAction } from "@/app/actions/chapa";
import type { PublicExternalApiConfig } from "@/server/external-api";
import type { PublicVerifyConfig } from "@/server/myseed-verify";
import type { ApiProvider, ApiProviderStatus, ApiState } from "@/server/external-api-console";
import type { ChapaAccount, ChapaBalance, ChapaTransaction } from "@/server/chapa";
import { cn } from "@/lib/utils";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");
const ago = (iso: string | null | undefined) => {
  if (!iso) return "No calls yet";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(iso);
};
const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Could not copy"));

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATE: Record<ApiState, { label: string; cls: string; Icon: typeof CheckCircle2Icon }> = {
  healthy: { label: "Working", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30", Icon: CheckCircle2Icon },
  degraded: { label: "Some failures", cls: "text-amber-800 dark:text-amber-200 bg-amber-500/10 border-amber-500/30", Icon: CircleAlertIcon },
  failing: { label: "Failing", cls: "text-destructive bg-destructive/10 border-destructive/30", Icon: XCircleIcon },
  untested: { label: "Not tested", cls: "text-sky-800 dark:text-sky-200 bg-sky-500/10 border-sky-500/30", Icon: CircleDashedIcon },
  off: { label: "Off", cls: "text-muted-foreground bg-muted border-border", Icon: CirclePauseIcon },
  not_set_up: { label: "Not set up", cls: "text-muted-foreground bg-muted border-border", Icon: CircleDashedIcon },
};

function StateBadge({ state }: { state: ApiState }) {
  const x = STATE[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", x.cls)} data-api-state={state}>
      <x.Icon className="size-3.5" aria-hidden /> {x.label}
    </span>
  );
}

const ABOUT: Record<ApiProvider, { what: string; docs?: { href: string; label: string } }> = {
  verify: { what: "Checks bank and wallet transfers (CBE, Awash, Dashen, BoA, telebirr, CBE Birr) and tells Myseed by signed webhook when a payment is accepted." },
  chapa: { what: "Card, telebirr and bank payments. Each business has its own Chapa keys, webhook and balance.", docs: { href: "https://developer.chapa.co", label: "Chapa API docs" } },
  sms: { what: "Every SMS Myseed sends goes through the SMS connections, in order, with retries. i-Conic is set up here; the others in Integrations, SMS.", docs: { href: "https://www.afromessage.com/developers", label: "AfroMessage API docs" } },
  academy: { what: "The academy's student API: Customer Support looks up enrolled students and their parents' phone numbers through it." },
  finance: { what: "The academy's finance API: platform revenue and bank slips Finance approves or rejects." },
  noor: { what: "Noor's admin site (cms.noorethiopia.com): Myseed signs in with a Noor login, reads its tables and sends changes through Noor's own forms." },
};

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

type Props = { status: ApiProviderStatus[]; config: PublicExternalApiConfig; verify: PublicVerifyConfig; origin: string; noor: { students: number; parents: number; plans: number; subscriptions: number; invoices: number; lastSyncedAt: string | null } };

export function ExternalApiConsole(props: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [status, setStatus] = React.useState(props.status);
  React.useEffect(() => setStatus(props.status), [props.status]);
  const initial = (sp.get("api") as ApiProvider | null) ?? "verify";
  const [active, setActive] = React.useState<ApiProvider>(props.status.some((s) => s.key === initial) ? initial : "verify");
  const pick = (k: ApiProvider) => {
    setActive(k);
    const n = new URLSearchParams(sp.toString());
    n.set("api", k);
    router.replace(`${path}?${n.toString()}`, { scroll: false });
  };
  // After a save or a test: this provider's status and calls again, then the rest of the page.
  const refresh = React.useCallback(
    async (k: ApiProvider) => {
      const r = await apiProviderStatusAction(k);
      if (r.ok && r.data) setStatus((cur) => cur.map((s) => (s.key === k ? r.data! : s)));
      router.refresh();
    },
    [router],
  );
  const s = status.find((x) => x.key === active)!;

  return (
    <div className="space-y-4" data-api-console>
      <p className="text-sm text-muted-foreground">
        Each outside system Myseed talks to: whether it is set up and working, its settings and tests, and its latest calls. Every call is also in{" "}
        <Link href="/admin/integrations?tab=monitor" className="underline underline-offset-2 hover:text-foreground">
          the Call monitor
        </Link>
        .
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" role="tablist" aria-label="Providers">
        {status.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={active === p.key}
            onClick={() => pick(p.key)}
            data-api-tile={p.key}
            className={cn(
              "min-w-0 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === p.key && "border-primary ring-1 ring-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-sm font-medium">{p.label}</span>
              <StateBadge state={p.state} />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={p.setup}>
              {p.setup}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {p.calls ? `${p.calls} calls today${p.failures ? `, ${p.failures} failed` : ""}` : ago(p.lastAt)}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]" data-api-panel={active} role="tabpanel">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">{s.label}</CardTitle>
                <CardDescription>{ABOUT[active].what}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {ABOUT[active].docs && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={ABOUT[active].docs!.href} target="_blank" rel="noreferrer">
                      <BookOpenIcon className="size-4" /> {ABOUT[active].docs!.label}
                    </a>
                  </Button>
                )}
                <StateBadge state={s.state} />
              </div>
            </CardHeader>
            {s.lastError && s.state === "failing" && (
              <CardContent className="pt-0">
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-api-last-error>
                  {s.lastError}
                </p>
              </CardContent>
            )}
          </Card>
          {active === "verify" && <VerifyPanel initial={props.verify} origin={props.origin} onChange={() => refresh("verify")} />}
          {active === "chapa" && <ChapaPanel origin={props.origin} onChange={() => refresh("chapa")} />}
          {active === "sms" && <SmsPanel config={props.config} onChange={() => refresh("sms")} />}
          {(active === "academy" || active === "finance") && <ServicePanel key={active} service={active} config={props.config} onChange={() => refresh(active)} />}
          {active === "noor" && <NoorPanel stats={props.noor} onChange={() => refresh("noor")} />}
        </div>
        <RecentCalls s={s} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Latest calls
// ---------------------------------------------------------------------------

function RecentCalls({ s }: { s: ApiProviderStatus }) {
  return (
    <Card className="h-fit" data-api-calls>
      <CardHeader>
        <CardTitle className="text-base">Latest calls</CardTitle>
        <CardDescription>
          {s.calls ? `${s.calls} in the last 24 hours, ${s.failures} failed, ${s.avgMs} ms on average.` : "None in the last 24 hours."} Tests are included and marked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {s.recent.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No calls yet. Run a test to see the first one here.</p>
        ) : (
          <ol className="divide-y rounded-md border">
            {s.recent.map((c) => (
              <li key={c.id} className="space-y-0.5 px-3 py-2 text-sm" data-api-call={c.ok ? "ok" : "failed"}>
                <div className="flex items-center gap-2">
                  {c.ok ? <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" aria-label="Succeeded" /> : <XCircleIcon className="size-4 shrink-0 text-destructive" aria-label="Failed" />}
                  {c.direction === "in" ? <ArrowDownLeftIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Callback in" /> : <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Call out" />}
                  <span className="min-w-0 flex-1 truncate" title={c.summary}>
                    {c.summary}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 pl-6 text-xs text-muted-foreground tabular-nums">
                  <span>{when(c.at)}</span>
                  {c.status > 0 && <span>HTTP {c.status}</span>}
                  <span>{c.ms} ms</span>
                  {c.test && <span className="font-medium">Test</span>}
                </div>
                {c.error && <p className="break-words pl-6 text-xs text-destructive">{c.error}</p>}
              </li>
            ))}
          </ol>
        )}
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={`/admin/integrations?tab=monitor&source=${s.monitorSource}&hours=168`}>All {s.label} calls in the Call monitor</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// A key field: the saved key is never shown; blank keeps it.
function KeyField({ id, label, value, onChange, saved, readable = true, onRemove, placeholder, className }: { id: string; label: string; value: string; onChange: (v: string) => void; saved: boolean; readable?: boolean; onRemove?: () => void; placeholder?: string; className?: string }) {
  return (
    <Field
      id={id}
      label={label}
      className={className}
      hint={
        <span className="flex flex-wrap items-center gap-x-2" data-key-state={!saved ? "none" : readable ? "saved" : "unreadable"}>
          {!saved ? "Not saved yet." : readable ? "Saved. Leave blank to keep it." : <span className="text-destructive">Saved, but it cannot be read on this server (the encryption secret changed). Enter it again.</span>}
          {saved && onRemove && (
            <button type="button" className="text-destructive underline underline-offset-2" onClick={onRemove}>
              Remove saved key
            </button>
          )}
        </span>
      }
    >
      <Input id={id} type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={saved ? "••••••••" : placeholder} className="font-mono" />
    </Field>
  );
}

function OnSwitch({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

type Result = { ok: boolean; message: string; ms?: number } | null;
function TestResult({ r, data }: { r: Result; data?: string }) {
  if (!r) return null;
  return (
    <p
      className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", r.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-destructive/30 bg-destructive/10 text-destructive")}
      data-api-result={r.ok ? "ok" : "failed"}
      {...(data ? { [data]: "" } : {})}
      role="status"
    >
      {r.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0" />}
      <span className="min-w-0 flex-1 break-words">{r.message}</span>
      {r.ms !== undefined && r.ms > 0 && <span className="shrink-0 text-xs tabular-nums">{r.ms} ms</span>}
    </p>
  );
}

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button size="sm" variant="ghost" onClick={() => copy(value)}>
          <CopyIcon className="size-4" /> Copy
        </Button>
      </div>
      <code className="block break-all rounded border bg-background px-2 py-1.5 font-mono text-xs">{value}</code>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Busy({ on }: { on: boolean }) {
  return on ? <Loader2Icon className="size-4 animate-spin" /> : null;
}

// ---------------------------------------------------------------------------
// Myseed Verify
// ---------------------------------------------------------------------------

function VerifyPanel({ initial, origin, onChange }: { initial: PublicVerifyConfig; origin: string; onChange: () => void }) {
  const [c, setC] = React.useState(initial);
  const [key, setKey] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result>(null);
  const [confirmReq, setConfirmReq] = React.useState(false);
  const reload = async () => {
    const r = await getMyseedVerifyConfigAction();
    if (r.ok && r.data) setC(r.data);
  };
  const save = async (extra: { clearApiKey?: boolean; clearWebhookSecret?: boolean } = {}) => {
    setBusy("save");
    const r = await saveMyseedVerifyConfigAction({ enabled: c.enabled, baseUrl: c.baseUrl, environment: c.environment, autoFulfill: c.autoFulfill, apiKey: key || undefined, webhookSecret: secret || undefined, ...extra });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setKey("");
    setSecret("");
    if (r.data) setC(r.data);
    toast.success("Myseed Verify saved");
    onChange();
  };
  const test = async () => {
    setBusy("test");
    const r = await testMyseedVerifyConnectionAction();
    setBusy(null);
    setResult(r.ok && r.data ? { ok: r.data.ok, message: r.data.message, ms: r.data.ms } : { ok: false, message: r.ok ? "No answer" : r.error });
    await reload();
    onChange();
  };
  const createRequest = async () => {
    setBusy("req");
    const r = await createVerifyPaymentRequestAction({ externalReference: `test_${Date.now()}`, currency: "ETB", items: [{ title: "Test payment request", minorAmount: "100", quantity: 1, category: "test" }] });
    setBusy(null);
    setResult(r.ok && r.data ? { ok: true, message: `Verify created request ${r.data.id} (${r.data.status}).${r.data.submissionUrl ? ` Payer page: ${r.data.submissionUrl}` : ""}` } : { ok: false, message: r.ok ? "No answer" : r.error });
    onChange();
  };
  return (
    <Card data-verify-card>
      <CardHeader>
        <CardTitle className="text-base">Settings</CardTitle>
        <CardDescription>{c.lastTestedAt ? `Last tested ${when(c.lastTestedAt)}${c.lastError ? `: ${c.lastError}` : ", connected."}` : "Not tested yet."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="verify-url" label="Address" hint="The Verify server, without /v1.">
            <Input id="verify-url" value={c.baseUrl} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} placeholder="https://verify.myseedops.tech" className="font-mono" />
          </Field>
          <Field id="verify-env" label="Environment" hint="Sandbox takes test transfers and slips; Production takes real money.">
            <select id="verify-env" className={sel} value={c.environment} onChange={(e) => setC({ ...c, environment: e.target.value as PublicVerifyConfig["environment"] })}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
              <option value="custom">Custom server</option>
            </select>
          </Field>
          <KeyField id="verify-key" label="API key" value={key} onChange={setKey} saved={c.hasApiKey} readable={!c.keyUnreadable} placeholder="vfy_sec_..." onRemove={() => save({ clearApiKey: true })} />
          <KeyField id="verify-secret" label="Webhook signing secret" value={secret} onChange={setSecret} saved={c.hasWebhookSecret} placeholder="whsec_..." onRemove={() => save({ clearWebhookSecret: true })} />
        </div>
        <CopyRow
          label="Webhook address"
          value={`${origin}/api/verify/webhook`}
          hint={
            <>
              Add it in Verify under Webhook endpoints, for <code>payment.accepted</code>. Events are refused unless their X-Verify-Signature matches the signing secret{c.hasWebhookSecret ? "" : <strong className="text-destructive"> (none saved yet: every event is refused)</strong>}.
            </>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <OnSwitch id="verify-enable" label="Use Myseed Verify" hint="Payment checks go through Verify" checked={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} />
          <OnSwitch id="verify-fulfill" label="Confirm fulfilment automatically" hint="Tell Verify the enrolment is done when its webhook arrives" checked={c.autoFulfill} onChange={(v) => setC({ ...c, autoFulfill: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button onClick={() => save()} disabled={!!busy} data-api-save>
            <Busy on={busy === "save"} /> Save
          </Button>
          <Button variant="outline" onClick={test} disabled={!!busy} data-api-test>
            <Busy on={busy === "test"} /> Test connection
          </Button>
          <Button variant="outline" onClick={() => setConfirmReq(true)} disabled={!!busy || !c.enabled}>
            <Busy on={busy === "req"} /> Create a test payment request
          </Button>
        </div>
        <TestResult r={result} />
      </CardContent>
      <AlertDialog open={confirmReq} onOpenChange={setConfirmReq}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a test payment request?</AlertDialogTitle>
            <AlertDialogDescription>
              Verify creates a real 1.00 ETB payment request in its {c.environment} environment. Nobody is charged unless someone pays it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={createRequest}>Create it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chapa
// ---------------------------------------------------------------------------

const EMPTY_CHAPA = { id: "", name: "", secretKey: "", publicKey: "", webhookSecret: "", currency: "ETB", active: true };

function ChapaPanel({ origin, onChange }: { origin: string; onChange: () => void }) {
  const [accounts, setAccounts] = React.useState<ChapaAccount[] | null>(null);
  const [balances, setBalances] = React.useState<ChapaBalance[]>([]);
  const [txs, setTxs] = React.useState<ChapaTransaction[]>([]);
  const [results, setResults] = React.useState<Record<string, Result>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<typeof EMPTY_CHAPA | null>(null);
  const [del, setDel] = React.useState<ChapaAccount | "all" | null>(null);
  const load = React.useCallback(async () => {
    const [a, b, t] = await Promise.all([listChapaAccountsAction(), fetchChapaBalancesAction(), listChapaTransactionsAction()]);
    setAccounts(a.ok ? a.data : []);
    if (b.ok) setBalances(b.data);
    if (t.ok) setTxs(t.data.slice(0, 8));
    if (!a.ok) toast.error(a.error ?? "Could not load the Chapa businesses");
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  const test = async (id: string) => {
    setBusy(`test-${id}`);
    const r = await testChapaAccountAction(id);
    setBusy(null);
    setResults((x) => ({ ...x, [id]: { ok: r.ok, message: r.message } }));
    onChange();
    void load();
  };
  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return toast.error("Give the business a name");
    if (!form.id && !form.secretKey.trim()) return toast.error("Give the Chapa secret key");
    setBusy("save");
    const r = await saveChapaAccountAction({ id: form.id || undefined, name: form.name.trim(), secretKey: form.secretKey.trim() || undefined, publicKey: form.publicKey.trim() || undefined, webhookSecret: form.webhookSecret.trim() || undefined, currency: form.currency, active: form.active });
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Could not save");
    toast.success(`${form.name} saved`);
    setForm(null);
    void load();
    onChange();
  };
  const remove = async () => {
    const target = del;
    setDel(null);
    if (!target) return;
    const r = target === "all" ? await clearAllChapaAccountsAction() : await deleteChapaAccountAction(target.id);
    if (!r.ok) return toast.error(r.error ?? "Could not remove");
    toast.success(target === "all" ? "All Chapa businesses removed" : `${target.name} removed`);
    void load();
    onChange();
  };
  const bal = (id: string) => balances.find((b) => b.accountId === id);
  const mode = (a: ChapaAccount) => (a.publicKey?.startsWith("CHAPUBK_TEST") ? "Test" : a.publicKey ? "Live" : null);

  return (
    <>
      <Card data-chapa-card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Businesses</CardTitle>
            <CardDescription>Each business uses its own Chapa keys. Checking a business asks Chapa for its balance (or its bank list when balances are not open to the key).</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/finance/chapa">
                <ExternalLinkIcon className="size-4" /> Chapa in Finance
              </Link>
            </Button>
            <Button size="sm" onClick={() => setForm({ ...EMPTY_CHAPA })} data-chapa-add>
              <PlusIcon className="size-4" /> Add business
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Loading…
            </p>
          ) : accounts.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No business yet. Add one with its Chapa secret key from the Chapa dashboard (Settings, API).</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {accounts.map((a) => {
                const b = bal(a.id);
                return (
                  <li key={a.id} className="space-y-2 p-3" data-chapa-account={a.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {a.name}
                          {mode(a) && <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">{mode(a)}</span>}
                          {!a.active && <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">Off</span>}
                        </p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {b ? (b.status === "error" ? <span className="text-destructive">{b.error ?? "Balance could not be read"}</span> : `${b.availableBalance.toLocaleString()} ${b.currency} available, ${b.ledgerBalance.toLocaleString()} ledger`) : `${a.currency}, balance not read`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" disabled={busy === `test-${a.id}`} onClick={() => test(a.id)} data-chapa-test>
                          <Busy on={busy === `test-${a.id}`} /> Check
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setForm({ id: a.id, name: a.name, secretKey: "", publicKey: a.publicKey ?? "", webhookSecret: "", currency: a.currency, active: a.active })} aria-label={`Edit ${a.name}`}>
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDel(a)} aria-label={`Remove ${a.name}`}>
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Webhook:</span>
                      <code className="min-w-0 break-all rounded border bg-muted/40 px-1.5 py-0.5">{`${origin}/api/finance/chapa/webhook/${a.id}`}</code>
                      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => copy(`${origin}/api/finance/chapa/webhook/${a.id}`)}>
                        Copy
                      </button>
                      {!a.hasWebhookSecret && <span className="text-amber-700 dark:text-amber-300">No webhook secret saved</span>}
                    </div>
                    <TestResult r={results[a.id] ?? null} />
                  </li>
                );
              })}
            </ul>
          )}
          {!!accounts?.length && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDel("all")}>
                Remove all businesses
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {txs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Latest transactions</CardTitle>
              <CardDescription>Straight from Chapa, all businesses.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/finance/chapa?tab=transactions">All transactions</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border text-sm">
              {txs.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.customerName || t.customerEmail || t.txRef}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.accountName} · {t.paymentMethod} · {when(t.createdAt)} · <span className="font-mono">{t.txRef}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-medium">
                      {t.amount.toLocaleString()} {t.currency}
                    </span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", t.status === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : t.status === "failed" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200")}>
                      {t.status === "success" ? "Paid" : t.status === "failed" ? "Failed" : "Pending"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? `Edit ${form.name}` : "Add a Chapa business"}</DialogTitle>
            <DialogDescription>Keys come from the Chapa dashboard, Settings, API. Secret keys are stored encrypted and never shown again.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <Field id="acc-name" label="Business name">
                <Input id="acc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Myseed Subscriptions" />
              </Field>
              <KeyField id="acc-sec" label="Secret key" value={form.secretKey} onChange={(v) => setForm({ ...form, secretKey: v })} saved={!!form.id} placeholder="CHASECK_TEST-… or CHASECK-…" />
              <Field id="acc-pub" label="Public key">
                <Input id="acc-pub" value={form.publicKey} onChange={(e) => setForm({ ...form, publicKey: e.target.value })} placeholder="CHAPUBK_TEST-… or CHAPUBK-…" className="font-mono" />
              </Field>
              <KeyField id="acc-hook" label="Webhook secret hash" value={form.webhookSecret} onChange={(v) => setForm({ ...form, webhookSecret: v })} saved={!!form.id && !!accounts?.find((a) => a.id === form.id)?.hasWebhookSecret} placeholder="The secret hash set in Chapa, Webhooks" />
              <div className="grid grid-cols-2 gap-3">
                <Field id="acc-curr" label="Currency">
                  <select id="acc-curr" className={sel} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    <option value="ETB">ETB</option>
                    <option value="USD">USD</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <OnSwitch id="acc-act" label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy === "save"} data-chapa-save>
              <Busy on={busy === "save"} /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del === "all" ? "Remove every Chapa business?" : `Remove ${(del as ChapaAccount | null)?.name ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>Its keys are deleted from Myseed and payments to it are no longer checked here. Chapa itself is not changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// SMS: i-Conic (its request shape comes from the i-Conic account) and the older AfroMessage token check
// ---------------------------------------------------------------------------

type Iconic = PublicExternalApiConfig["iconicSms"];

function SmsPanel({ config, onChange }: { config: PublicExternalApiConfig; onChange: () => void }) {
  const router = useRouter();
  const [i, setIState] = React.useState<Iconic>(config.iconicSms);
  const [am, setAm] = React.useState(config.sms);
  const [iKey, setIKey] = React.useState("");
  const [amKey, setAmKey] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [iResult, setIResult] = React.useState<Result>(null);
  const [amResult, setAmResult] = React.useState<Result>(null);
  const [balance, setBalance] = React.useState<{ balance: number; currency: string } | null>(null);
  const setI = (p: Partial<Iconic>) => setIState((c) => ({ ...c, ...p }));
  const saveIconic = async (clear = false) => {
    setBusy("i-save");
    const { apiKey: _k, ...rest } = i;
    const r = await saveExternalApiConfigAction({ iconicSms: { ...rest, ...(iKey ? { apiKey: iKey } : {}) }, ...(clear ? { clearKeys: ["iconicSms"] } : {}) });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setIKey("");
    toast.success("i-Conic saved");
    onChange();
  };
  const saveAm = async (clear = false) => {
    setBusy("am-save");
    const { apiKey: _k, ...rest } = am;
    const r = await saveExternalApiConfigAction({ sms: { ...rest, ...(amKey ? { apiKey: amKey } : {}) }, ...(clear ? { clearKeys: ["sms"] } : {}) });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setAmKey("");
    toast.success("AfroMessage saved");
    onChange();
  };
  const test = async (service: "iconicSms" | "sms") => {
    setBusy(`${service}-test`);
    const r = await testExternalApiAction(service, service === "iconicSms" ? phone.trim() || null : null);
    setBusy(null);
    const res = r.ok && r.data ? { ok: r.data.ok, message: r.data.message, ms: r.data.ms } : { ok: false, message: r.ok ? "No answer" : r.error };
    (service === "iconicSms" ? setIResult : setAmResult)(res);
    onChange();
  };
  const checkBalance = async () => {
    setBusy("i-bal");
    const r = await fetchIconicSmsStatusAction();
    setBusy(null);
    if (r.ok && r.data) setBalance({ balance: r.data.balance, currency: r.data.currency });
    else setIResult({ ok: false, message: r.ok ? "No answer" : r.error });
    onChange();
  };
  const k = config.keys;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Sending, history and costs</CardTitle>
            <CardDescription>Compose, delivery reports, prices and the order of SMS connections (AfroMessage, Africa&apos;s Talking, Twilio, i-Conic) are in Integrations, SMS.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/integrations?tab=sms&sms=history">History</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/integrations?tab=sms&sms=setup">SMS connections</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card data-iconic-card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">i-Conic SMS</CardTitle>
            <CardDescription>i-Conic does not publish its API, so copy the address, send path, how the key is sent and the field names from your i-Conic account&apos;s API page. Saving makes i-Conic an SMS connection used for routing, retries and fallback.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="iconic-enable">On</Label>
            <Switch id="iconic-enable" checked={i.enabled} onCheckedChange={(v) => setI({ enabled: v })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="iconic-url" label="API address" className="sm:col-span-2">
              <Input id="iconic-url" value={i.baseUrl} onChange={(e) => setI({ baseUrl: e.target.value })} placeholder="https://… (from your i-Conic account)" className="font-mono" />
            </Field>
            <Field id="iconic-sender" label="Sender ID">
              <Input id="iconic-sender" value={i.senderId} onChange={(e) => setI({ senderId: e.target.value })} placeholder="MYSEED" />
            </Field>
            <KeyField id="iconic-key" label="API key or token" className="sm:col-span-3" value={iKey} onChange={setIKey} saved={k.iconicSms.saved} readable={k.iconicSms.readable} onRemove={() => saveIconic(true)} />
            <Field id="iconic-path" label="Send path">
              <Input id="iconic-path" value={i.sendPath} onChange={(e) => setI({ sendPath: e.target.value })} placeholder="/send" className="font-mono" />
            </Field>
            <Field id="iconic-method" label="Method">
              <select id="iconic-method" className={sel} value={i.method} onChange={(e) => setI({ method: e.target.value as Iconic["method"] })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </Field>
            <Field id="iconic-format" label="Fields sent as">
              <select id="iconic-format" className={sel} value={i.format} onChange={(e) => setI({ format: e.target.value as Iconic["format"] })}>
                <option value="json">JSON body</option>
                <option value="form">Form body</option>
                <option value="query">In the address (query)</option>
              </select>
            </Field>
            <Field id="iconic-auth" label="Key sent as">
              <select id="iconic-auth" className={sel} value={i.authStyle} onChange={(e) => setI({ authStyle: e.target.value as Iconic["authStyle"] })}>
                <option value="bearer">Authorization: Bearer</option>
                <option value="header">A header</option>
                <option value="query">In the address</option>
              </select>
            </Field>
            {i.authStyle !== "bearer" && (
              <Field id="iconic-auth-name" label={i.authStyle === "header" ? "Header name" : "Address field name"}>
                <Input id="iconic-auth-name" value={i.authName} onChange={(e) => setI({ authName: e.target.value })} placeholder={i.authStyle === "header" ? "KEY" : "token"} className="font-mono" />
              </Field>
            )}
            <Field id="iconic-to" label="Phone field">
              <Input id="iconic-to" value={i.toField} onChange={(e) => setI({ toField: e.target.value })} placeholder="to" className="font-mono" />
            </Field>
            <Field id="iconic-msg" label="Message field">
              <Input id="iconic-msg" value={i.messageField} onChange={(e) => setI({ messageField: e.target.value })} placeholder="message" className="font-mono" />
            </Field>
            <Field id="iconic-from" label="Sender field" hint="Empty: the sender is not sent.">
              <Input id="iconic-from" value={i.senderField} onChange={(e) => setI({ senderField: e.target.value })} placeholder="from" className="font-mono" />
            </Field>
            <Field id="iconic-bal" label="Balance path (optional)" className="sm:col-span-2">
              <Input id="iconic-bal" value={i.balancePath} onChange={(e) => setI({ balancePath: e.target.value })} placeholder="/balance" className="font-mono" />
            </Field>
            <Field id="iconic-bal-field" label="Balance field in the answer">
              <Input id="iconic-bal-field" value={i.balanceField} onChange={(e) => setI({ balanceField: e.target.value })} placeholder="balance or data.balance" className="font-mono" />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <Button onClick={() => saveIconic()} disabled={!!busy} data-api-save>
              <Busy on={busy === "i-save"} /> Save
            </Button>
            <Field id="iconic-test-phone" label="Test phone (sends one SMS)">
              <Input id="iconic-test-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2519…" className="w-44" />
            </Field>
            <Button variant="outline" disabled={!!busy} onClick={() => test("iconicSms")} data-iconic-test>
              <Busy on={busy === "iconicSms-test"} /> {phone.trim() ? "Send test SMS" : "Test connection"}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={checkBalance}>
              <Busy on={busy === "i-bal"} /> Check balance
            </Button>
            {balance && (
              <span className="rounded-full border px-2.5 py-1 text-sm font-medium tabular-nums" data-iconic-balance>
                {balance.balance.toLocaleString()} {balance.currency}
              </span>
            )}
          </div>
          <TestResult r={iResult} data="data-iconic-result" />
          <p className="text-xs text-muted-foreground">Save first, then test. A test SMS goes through i-Conic only (no fallback) and appears in the SMS history.</p>
        </CardContent>
      </Card>

      <Card data-afromessage-card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">AfroMessage token check</CardTitle>
            <CardDescription>
              Checks that an AfroMessage token is accepted, without sending anything. To send through AfroMessage, add it as an SMS connection.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => router.push("/admin/integrations?tab=sms&sms=setup")}>
                Open SMS connections
              </button>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sms-enable">On</Label>
            <Switch id="sms-enable" checked={am.enabled} onCheckedChange={(v) => setAm({ ...am, enabled: v })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="sms-url" label="Address" className="sm:col-span-2">
              <Input id="sms-url" value={am.baseUrl} onChange={(e) => setAm({ ...am, baseUrl: e.target.value })} placeholder="https://api.afromessage.com/api" className="font-mono" />
            </Field>
            <Field id="sms-sender" label="Sender name">
              <Input id="sms-sender" value={am.senderId} onChange={(e) => setAm({ ...am, senderId: e.target.value })} placeholder="MySeed" />
            </Field>
            <KeyField id="sms-key" label="Token" className="sm:col-span-3" value={amKey} onChange={setAmKey} saved={k.sms.saved} readable={k.sms.readable} onRemove={() => saveAm(true)} />
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={() => saveAm()} disabled={!!busy}>
              <Busy on={busy === "am-save"} /> Save
            </Button>
            <Button variant="outline" onClick={() => test("sms")} disabled={!!busy || !am.baseUrl}>
              <Busy on={busy === "sms-test"} /> Check token
            </Button>
          </div>
          <TestResult r={amResult} />
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Academy and Finance APIs
// ---------------------------------------------------------------------------

function ServicePanel({ service, config, onChange }: { service: "academy" | "finance"; config: PublicExternalApiConfig; onChange: () => void }) {
  const [c, setC] = React.useState(config[service]);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result>(null);
  const name = service === "academy" ? "Academy" : "Finance";
  const save = async (clear = false) => {
    setBusy("save");
    const { apiKey: _k, ...rest } = c;
    const r = await saveExternalApiConfigAction({ [service]: { ...rest, ...(key ? { apiKey: key } : {}) }, ...(clear ? { clearKeys: [service] } : {}) });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setKey("");
    toast.success(`${name} API saved`);
    onChange();
  };
  const test = async () => {
    setBusy("test");
    const r = await testExternalApiAction(service);
    setBusy(null);
    setResult(r.ok && r.data ? { ok: r.data.ok, message: r.data.message, ms: r.data.ms } : { ok: false, message: r.ok ? "No answer" : r.error });
    onChange();
  };
  return (
    <Card data-service-card={service}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>The test asks {"{address}"}/health with the key as a Bearer token and in X-API-Key.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${service}-enable`}>On</Label>
          <Switch id={`${service}-enable`} checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={`${service}-url`} label="Address" className="sm:col-span-2">
            <Input id={`${service}-url`} value={c.baseUrl} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} placeholder={service === "academy" ? "https://academy.myseed.com.et/api/v1" : "https://academy.myseed.com.et/api/v1/finance"} className="font-mono" />
          </Field>
          <Field id={`${service}-timeout`} label="Wait at most (seconds)">
            <Input id={`${service}-timeout`} type="number" min={1} max={60} value={Math.round(c.timeoutMs / 1000)} onChange={(e) => setC({ ...c, timeoutMs: (Number(e.target.value) || 10) * 1000 })} />
          </Field>
          <KeyField id={`${service}-key`} label="API key" className="sm:col-span-3" value={key} onChange={setKey} saved={config.keys[service].saved} readable={config.keys[service].readable} onRemove={() => save(true)} />
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => save()} disabled={!!busy} data-api-save>
            <Busy on={busy === "save"} /> Save
          </Button>
          <Button variant="outline" onClick={test} disabled={!!busy || !c.baseUrl} data-api-test>
            <Busy on={busy === "test"} /> Test connection
          </Button>
        </div>
        <TestResult r={result} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Noor
// ---------------------------------------------------------------------------

function NoorPanel({ stats, onChange }: { stats: Props["noor"]; onChange: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const check = async () => {
    setBusy(true);
    const r = await checkLegacyCmsAuthAction();
    setBusy(false);
    setResult({ ok: r.ok, message: r.ok ? `Signed in to Noor as ${r.username}.` : r.message, ms: r.ms });
    onChange();
  };
  const rows: [string, number][] = [
    ["Students", stats.students],
    ["Parents", stats.parents],
    ["Plans", stats.plans],
    ["Active subscriptions", stats.subscriptions],
    ["Invoices", stats.invoices],
  ];
  return (
    <Card data-noor-card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">Stored copy</CardTitle>
          <CardDescription>{stats.lastSyncedAt ? `Last synced ${when(stats.lastSyncedAt)}.` : "Not synced yet."} The login, sync and who sees which tables are set in Legacy CMS.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/admin?tab=legacy-cms">Noor login and access</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/legacy-cms">Open Legacy CMS</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {rows.map(([l, n]) => (
            <div key={l} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{l}</dt>
              <dd className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant="outline" onClick={check} disabled={busy} data-api-test>
            <Busy on={busy} /> Check the Noor login
          </Button>
        </div>
        <TestResult r={result} />
      </CardContent>
    </Card>
  );
}
