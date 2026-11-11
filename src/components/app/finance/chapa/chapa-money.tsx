"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRightIcon, CheckIcon, GaugeIcon, LandmarkIcon, PlusIcon, RotateCcwIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusStrip, Toolbar } from "@/components/app/page-kit";
import { CHAPA_ACTIONS, CHAPA_ROLES, type ChapaAction, type ChapaActionRule, type ChapaSettings, type ChapaTx } from "@/lib/chapa";
import type { ChapaBusiness, ChapaOp, OpKind } from "@/server/chapa-hub";
import * as A from "@/app/actions/chapa-hub";
import { cn } from "@/lib/utils";

const money = (n: number, c = "ETB") => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Fixed to the workspace's zone so the server and the browser render the same text.
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" });

function useOps(biz: string | null, kinds: OpKind[]) {
  const [ops, setOps] = React.useState<ChapaOp[] | null>(null);
  const load = React.useCallback(() => void A.chapaOpsAction(biz, kinds).then((r) => setOps(r.ok ? r.data ?? [] : [])), [biz, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(load, [load]);
  return { ops, load };
}

// Requests with maker, checker and Chapa's answer; a second person approves.
function OpsTable({ ops, onChanged, verify }: { ops: ChapaOp[]; onChanged: () => void; verify?: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast.error(r.error);
    else toast.success(done);
    onChanged();
  };
  return (
    <div className="overflow-auto rounded-xl border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
          <tr><th className="px-2 py-2">When</th><th className="px-2 py-2">What</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Asked by</th><th className="px-2 py-2">Approved by</th><th className="px-2 py-2" /></tr>
        </thead>
        <tbody>
          {ops.map((o) => (
            <tr key={o.id} className="border-t align-top">
              <td className="px-2 py-1.5 whitespace-nowrap">{when(o.createdAt)}</td>
              <td className="px-2 py-1.5">
                <div className="font-medium">{o.kind === "transfer" ? `${o.detail.account_name} · ${o.detail.account_number}` : o.kind === "bulk_transfer" ? `${o.detail.title || "Bulk"} · ${(o.detail.items ?? []).length} payees` : o.kind === "refund" ? `Refund ${o.detail.tx_ref}` : `Swap ${o.detail.from ?? "USD"} → ${o.detail.to ?? "ETB"}`}</div>
                <div className="text-[11px] text-muted-foreground">{o.business} · {o.reference}{o.reason ? ` · ${o.reason}` : ""}</div>
                {o.error && <div className="text-[11px] text-rose-600">{o.error}</div>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(o.amount, o.currency)}</td>
              <td className="px-2 py-1.5">{o.status.replace("_", " ")}</td>
              <td className="px-2 py-1.5">{o.requestedBy ?? "-"}</td>
              <td className="px-2 py-1.5">{o.approvedBy ?? "-"}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {o.status === "awaiting_approval" && (
                  <>
                    <Button size="sm" className="h-7 text-xs" disabled={busy === o.id} onClick={() => act(o.id, () => A.chapaDecideOpAction(o.id, true), "Approved and sent to Chapa")}><CheckIcon /> Approve</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === o.id} onClick={() => { const n = prompt("Why is it rejected?"); if (n !== null) void act(o.id, () => A.chapaDecideOpAction(o.id, false, n), "Rejected"); }}><XIcon /> Reject</Button>
                  </>
                )}
                {verify && o.status === "sent" && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === o.id} onClick={() => act(o.id, () => A.chapaVerifyTransferAction(o.id), "Status checked with Chapa")}><ShieldCheckIcon /> Check status</Button>}
              </td>
            </tr>
          ))}
          {!ops.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nothing yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function BalanceView({ biz, businesses }: { biz: string | null; businesses: ChapaBusiness[] }) {
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof A.chapaBalancesAction>> | null>(null);
  const load = React.useCallback(() => void A.chapaBalancesAction(biz).then(setRows), [biz]);
  React.useEffect(load, [load]);
  const { ops, load: loadOps } = useOps(biz, ["swap"]);
  const swappable = businesses.filter((b) => b.rights.swap && (!biz || b.id === biz));
  const [open, setOpen] = React.useState(false);
  const [acc, setAcc] = React.useState(swappable[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  return (
    <div className="space-y-4">
      {rows && !rows.ok && <StatusStrip tone="danger">{rows.error}</StatusStrip>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(rows?.ok ? rows.data ?? [] : []).map((b, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{b.business}{b.mode === "test" ? " (test)" : ""}</p>
            {b.error ? <p className="mt-1 text-sm text-rose-600">{b.error}</p> : (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{money(b.available, b.currency)}</p>
                <p className="text-xs text-muted-foreground">Available · ledger {money(b.ledger, b.currency)}</p>
              </>
            )}
          </div>
        ))}
        {!rows && <StatusStrip>Asking Chapa…</StatusStrip>}
      </div>
      <Toolbar label="Swap" end={swappable.length ? <Button size="sm" onClick={() => setOpen(true)}><ArrowLeftRightIcon /> Swap USD to ETB</Button> : <span className="text-xs text-muted-foreground">Swap is off for your role. Admin turns it on in Settings.</span>}>
        <h2 className="text-sm font-semibold">Swaps</h2>
      </Toolbar>
      {ops && <OpsTable ops={ops} onChanged={() => (loadOps(), load())} />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Swap USD to ETB</DialogTitle><DialogDescription>At Chapa&apos;s live rate. Logged with who asked.</DialogDescription></DialogHeader>
          <label className="grid gap-1 text-sm">Business<select value={acc} onChange={(e) => setAcc(e.target.value)} className="h-9 rounded-md border bg-background px-2">{swappable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Amount in USD<Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <DialogFooter>
            <Button onClick={async () => { const r = await A.chapaRequestOpAction({ kind: "swap", accountId: acc, amount: Number(amount), currency: "USD", detail: { from: "USD", to: "ETB" } }); if (!r.ok) return toast.error(r.error); toast.success("Swap requested"); setOpen(false); loadOps(); load(); }}>Swap</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WithdrawalsView({ biz, businesses }: { biz: string | null; businesses: ChapaBusiness[] }) {
  const { ops, load } = useOps(biz, ["transfer", "bulk_transfer"]);
  const allowed = businesses.filter((b) => (b.rights.transfer || b.rights.bulk_transfer) && (!biz || b.id === biz));
  const [open, setOpen] = React.useState<"single" | "bulk" | null>(null);
  const [remote, setRemote] = React.useState<Awaited<ReturnType<typeof A.chapaRemoteTransfersAction>> | null>(null);
  const viewBiz = biz ?? businesses[0]?.id;
  React.useEffect(() => {
    if (viewBiz) void A.chapaRemoteTransfersAction(viewBiz).then(setRemote);
  }, [viewBiz]);
  return (
    <div className="space-y-4">
      <Toolbar
        label="Withdrawals"
        end={allowed.length ? <><Button size="sm" disabled={!allowed.some((b) => b.rights.transfer)} onClick={() => setOpen("single")}><LandmarkIcon /> New withdrawal</Button><Button size="sm" variant="outline" disabled={!allowed.some((b) => b.rights.bulk_transfer)} onClick={() => setOpen("bulk")}><PlusIcon /> Bulk withdrawal</Button></> : <span className="text-xs text-muted-foreground">Withdrawals are off for your role. Admin turns them on in Settings, with limits and a second approver.</span>}
      >
        <h2 className="text-sm font-semibold">Requested from Myseed</h2>
      </Toolbar>
      {ops && <OpsTable ops={ops} onChanged={load} verify />}
      <h2 className="text-sm font-semibold">All withdrawals on Chapa{biz ? "" : ` (${businesses[0]?.name})`}</h2>
      {remote && !remote.ok && <StatusStrip tone="warning">{remote.error}</StatusStrip>}
      {remote?.ok && (
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">When</th><th className="px-2 py-2">To</th><th className="px-2 py-2">Bank</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Reference</th></tr></thead>
            <tbody>
              {(remote.data ?? []).map((t, i) => <tr key={i} className="border-t"><td className="px-2 py-1.5">{t.createdAt ? when(t.createdAt) : "-"}</td><td className="px-2 py-1.5">{t.name} {t.account}</td><td className="px-2 py-1.5">{t.bank}</td><td className="px-2 py-1.5 text-right">{money(t.amount, t.currency)}</td><td className="px-2 py-1.5">{t.status}</td><td className="px-2 py-1.5 font-mono text-[11px]">{t.reference}</td></tr>)}
              {!remote.data?.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No withdrawals on Chapa.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {open && <TransferDialog kind={open} businesses={allowed} onClose={() => setOpen(null)} onDone={load} />}
    </div>
  );
}

function TransferDialog({ kind, businesses, onClose, onDone }: { kind: "single" | "bulk"; businesses: ChapaBusiness[]; onClose: () => void; onDone: () => void }) {
  const [acc, setAcc] = React.useState(businesses.find((b) => (kind === "single" ? b.rights.transfer : b.rights.bulk_transfer))?.id ?? "");
  const [banks, setBanks] = React.useState<{ code: string; name: string }[]>([]);
  const [benes, setBenes] = React.useState<{ id: string; name: string; bank_code: string; bank_name: string | null; account_number: string }[]>([]);
  const [f, setF] = React.useState({ account_name: "", account_number: "", bank_code: "", amount: "", reason: "", save: false });
  const [bulk, setBulk] = React.useState("");
  const [title, setTitle] = React.useState("");
  React.useEffect(() => {
    if (!acc) return;
    void A.chapaBanksAction(acc).then((r) => r.ok && setBanks(r.data ?? []));
    void A.chapaBeneficiariesAction(acc).then((r) => r.ok && setBenes(r.data ?? []));
  }, [acc]);
  const items = bulk.split("\n").map((l) => l.split(",").map((x) => x.trim())).filter((x) => x.length >= 4 && x[0]).map(([account_name, account_number, bank_code, amount]) => ({ account_name, account_number, bank_code, amount: Number(amount) }));
  const total = items.reduce((a, x) => a + (x.amount || 0), 0);
  const submit = async () => {
    const r =
      kind === "single"
        ? await A.chapaRequestOpAction({ kind: "transfer", accountId: acc, amount: Number(f.amount), reason: f.reason, detail: { account_name: f.account_name, account_number: f.account_number, bank_code: f.bank_code, bank_name: banks.find((b) => b.code === f.bank_code)?.name } })
        : await A.chapaRequestOpAction({ kind: "bulk_transfer", accountId: acc, amount: total, reason: f.reason, detail: { title, items } });
    if (!r.ok) return toast.error(r.error);
    if (kind === "single" && f.save) await A.chapaSaveBeneficiaryAction({ accountId: acc, name: f.account_name, bankCode: f.bank_code, bankName: banks.find((b) => b.code === f.bank_code)?.name, accountNumber: f.account_number });
    toast.success("Withdrawal requested. It waits for a second approver if the rules ask for one.");
    onDone();
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{kind === "single" ? "New withdrawal" : "Bulk withdrawal"}</DialogTitle><DialogDescription>Checked against Admin&apos;s limit and daily cap. Someone else approves it when a second approver is required.</DialogDescription></DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">Business<select value={acc} onChange={(e) => setAcc(e.target.value)} className="h-9 rounded-md border bg-background px-2">{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          {kind === "single" ? (
            <>
              {!!benes.length && (
                <label className="grid gap-1">Saved payee<select defaultValue="" onChange={(e) => { const b = benes.find((x) => x.id === e.target.value); if (b) setF({ ...f, account_name: b.name, account_number: b.account_number, bank_code: b.bank_code }); }} className="h-9 rounded-md border bg-background px-2"><option value="">Choose…</option>{benes.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.bank_name} {b.account_number}</option>)}</select></label>
              )}
              <label className="grid gap-1">Account name<Input value={f.account_name} onChange={(e) => setF({ ...f, account_name: e.target.value })} /></label>
              <label className="grid gap-1">Bank or wallet<select value={f.bank_code} onChange={(e) => setF({ ...f, bank_code: e.target.value })} className="h-9 rounded-md border bg-background px-2"><option value="">Choose…</option>{banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select></label>
              <label className="grid gap-1">Account number<Input value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} /></label>
              <label className="grid gap-1">Amount (ETB)<Input type="number" min="1" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.save} onChange={(e) => setF({ ...f, save: e.target.checked })} /> Save this payee</label>
            </>
          ) : (
            <>
              <label className="grid gap-1">Title<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="November presenter fees" /></label>
              <label className="grid gap-1">One payee per line: name, account number, bank code, amount<Textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Abebe Kebede, 1000123456789, 946, 1500"} /></label>
              <p className="text-xs text-muted-foreground">{items.length} payees · total {money(total)}. Bank codes: {banks.slice(0, 6).map((b) => `${b.name} ${b.code}`).join(", ")}{banks.length > 6 ? "…" : ""}</p>
            </>
          )}
          <label className="grid gap-1">Reason<Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}>Request withdrawal</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefundsView({ biz }: { biz: string | null }) {
  const { ops, load } = useOps(biz, ["refund"]);
  return (
    <div className="space-y-3">
      <StatusStrip>Refunds start from a payment: Transactions, open the payment, Refund. Admin sets who may refund, the limit and whether someone else must approve.</StatusStrip>
      {ops && <OpsTable ops={ops} onChanged={load} />}
    </div>
  );
}

export function RefundButton({ tx, onDone }: { tx: ChapaTx; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(String(tx.amount));
  const [reason, setReason] = React.useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><RotateCcwIcon /> Refund</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Refund {money(tx.amount, tx.currency)}</DialogTitle><DialogDescription>Full or part of the payment, with the reason.</DialogDescription></DialogHeader>
          <label className="grid gap-1 text-sm">Amount<Input type="number" min="1" max={tx.amount} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Reason<Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <DialogFooter>
            <Button disabled={!reason.trim()} onClick={async () => { const r = await A.chapaRequestOpAction({ kind: "refund", accountId: tx.accountId, amount: Number(amount), currency: tx.currency, reason, detail: { tx_ref: tx.txRef } }); if (!r.ok) return toast.error(r.error); toast.success("Refund requested"); setOpen(false); onDone(); }}>Request refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings (Admin): businesses, rules, and the action matrix per business and role.
// ---------------------------------------------------------------------------

export function SettingsView({ businesses, settings }: { businesses: ChapaBusiness[]; settings: ChapaSettings }) {
  const router = useRouter();
  const [s, setS] = React.useState(settings);
  const [scope, setScope] = React.useState("*");
  const [busy, setBusy] = React.useState(false);
  const [probe, setProbe] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const rule = (a: ChapaAction): ChapaActionRule => ({ ...(s.access["*"]?.[a] ?? { enabled: false, roles: [] }), ...(scope === "*" ? {} : (s.access[scope]?.[a] ?? {})) });
  const setRule = (a: ChapaAction, patch: Partial<ChapaActionRule>) => setS({ ...s, access: { ...s.access, [scope]: { ...(s.access[scope] ?? {}), [a]: { ...rule(a), ...patch } } } });
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Businesses</h2>
          <Button asChild size="sm" variant="outline"><a href="/admin?tab=external-apis">Add a business or change keys</a></Button>
        </div>
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Business</th><th className="px-2 py-2">Mode</th><th className="px-2 py-2">Sync every</th><th className="px-2 py-2">Health</th><th className="px-2 py-2">Webhook address</th><th className="px-2 py-2" /></tr></thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className="border-t align-top">
                  <td className="px-2 py-1.5 font-medium">{b.name}</td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`${b.name} mode`} defaultValue={b.mode} onChange={async (e) => { const r = await A.chapaUpdateBusinessAction(b.id, { mode: e.target.value }); if (!r.ok) toast.error(r.error); else router.refresh(); }} className="h-7 rounded border bg-background px-1">
                      <option value="live">Live</option><option value="test">Test (left out of totals)</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`${b.name} sync interval`} defaultValue={b.syncMinutes} onChange={async (e) => { const r = await A.chapaUpdateBusinessAction(b.id, { syncMinutes: Number(e.target.value) }); if (!r.ok) toast.error(r.error); }} className="h-7 rounded border bg-background px-1">
                      {[5, 10, 15, 30, 60, 180, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m === 1440 ? "daily" : `${m / 60} h`}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">{b.health === "error" ? <span className="text-rose-600" title={b.lastError ?? ""}>Error: {b.lastError?.slice(0, 50)}</span> : b.lastSyncAt ? `OK, ${when(b.lastSyncAt)} (${b.lastSyncRows} rows)${b.backfilled ? "" : ", history still loading"}` : "Not synced"}</td>
                  <td className="px-2 py-1.5"><code className="text-[10px]">{origin}/api/finance/chapa/webhook/{b.id}</code>{!b.hasWebhookSecret && <div className="text-[11px] text-amber-700">Add the webhook secret in External APIs</div>}{b.webhookAt && <div className="text-[11px] text-muted-foreground">Last call {when(b.webhookAt)}</div>}</td>
                  <td className="px-2 py-1.5"><Button size="sm" variant="ghost" className="h-7 text-xs" disabled={probe === b.id} onClick={async () => { setProbe(b.id); const r = await A.chapaProbeAction(b.id); setProbe(null); if (!r.ok) toast.error(r.error); else { toast.success("Checked what Chapa returns"); router.refresh(); } }}><GaugeIcon /> Check API</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {businesses.some((b) => b.probe) && (
          <details className="rounded-lg border p-2 text-xs">
            <summary className="cursor-pointer font-medium">What each business&apos;s API returned</summary>
            {businesses.filter((b) => b.probe).map((b) => <pre key={b.id} className="mt-2 max-h-56 overflow-auto rounded bg-muted p-2 text-[10px]">{b.name}: {JSON.stringify(b.probe, null, 2)}</pre>)}
          </details>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Rules</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs">A pending payment is stuck after (minutes)<Input type="number" min={5} value={s.rules.pendingMinutes} onChange={(e) => setS({ ...s, rules: { ...s.rules, pendingMinutes: Number(e.target.value) } })} /></label>
          <label className="grid gap-1 text-xs">Send follow-ups automatically at (Addis time; empty = off)<Input type="time" value={s.rules.autoSendTime ?? ""} onChange={(e) => setS({ ...s, rules: { ...s.rules, autoSendTime: e.target.value || null } })} /></label>
          <label className="grid gap-1 text-xs">Do not open a second case for the same customer within (hours)<Input type="number" min={1} value={s.rules.dedupeHours} onChange={(e) => setS({ ...s, rules: { ...s.rules, dedupeHours: Number(e.target.value) } })} /></label>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Who may do what</h2>
          <select aria-label="Rules for" value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="*">Every business</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>Only {b.name}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Money actions start off. A business&apos;s own rules replace the general ones.</span>
        </div>
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Action</th><th className="px-2 py-2">On</th><th className="px-2 py-2">Roles</th><th className="px-2 py-2">Limit each</th><th className="px-2 py-2">Daily cap</th><th className="px-2 py-2">Second approver</th></tr></thead>
            <tbody>
              {CHAPA_ACTIONS.map(([a, label, isMoney]) => {
                const r = rule(a);
                return (
                  <tr key={a} className={cn("border-t", isMoney && "bg-amber-500/5")}>
                    <td className="px-2 py-1.5 font-medium">{label}</td>
                    <td className="px-2 py-1.5"><input type="checkbox" aria-label={`${label} on`} checked={r.enabled} onChange={(e) => setRule(a, { enabled: e.target.checked })} /></td>
                    <td className="px-2 py-1.5"><div className="flex flex-wrap gap-2">{CHAPA_ROLES.map((role) => <label key={role} className="flex items-center gap-1"><input type="checkbox" checked={r.roles.includes(role)} onChange={(e) => setRule(a, { roles: e.target.checked ? [...r.roles, role] : r.roles.filter((x) => x !== role) })} />{role.replace("_", " ")}</label>)}</div></td>
                    <td className="px-2 py-1.5">{isMoney ? <Input type="number" min={0} className="h-7 w-24 text-xs" value={r.limit ?? ""} onChange={(e) => setRule(a, { limit: e.target.value ? Number(e.target.value) : null })} /> : "-"}</td>
                    <td className="px-2 py-1.5">{a === "transfer" || a === "bulk_transfer" ? <Input type="number" min={0} className="h-7 w-24 text-xs" value={r.dailyCap ?? ""} onChange={(e) => setRule(a, { dailyCap: e.target.value ? Number(e.target.value) : null })} /> : "-"}</td>
                    <td className="px-2 py-1.5">{isMoney ? <input type="checkbox" aria-label={`${label} needs a second approver`} checked={!!r.secondApprover} onChange={(e) => setRule(a, { secondApprover: e.target.checked })} /> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button disabled={busy} onClick={async () => { setBusy(true); const r = await A.chapaSaveSettingsAction(s); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success("Chapa rules saved"); router.refresh(); }}>Save rules</Button>
      </section>
    </div>
  );
}
