"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  CopyIcon,
  GlobeIcon,
  KeyRoundIcon,
  Loader2Icon,
  MessageSquareIcon,
  PhoneCallIcon,
  ReceiptIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  ShieldAlertIcon,
  XCircleIcon,
  CreditCardIcon,
  PlusIcon,
  Trash2Icon,
  ExternalLinkIcon,
  Building2Icon,
  SparklesIcon,
  CheckIcon,
  PencilIcon,
  ShieldCheckIcon,
} from "lucide-react";
import {
  getMyseedVerifyConfigAction,
  saveMyseedVerifyConfigAction,
  testMyseedVerifyConnectionAction,
  createVerifyPaymentRequestAction,
} from "@/app/actions/myseed-verify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveExternalApiConfigAction, testExternalApiAction, fetchIconicSmsStatusAction } from "@/app/actions/external-api";
import {
  listChapaAccountsAction,
  saveChapaAccountAction,
  deleteChapaAccountAction,
  testChapaAccountAction,
  fetchChapaBalancesAction,
  listChapaTransactionsAction,
  clearAllChapaAccountsAction,
} from "@/app/actions/chapa";
import type { ExternalApiConfig } from "@/server/external-api";
import type { ChapaAccount, ChapaBalance, ChapaTransaction } from "@/server/chapa";
import { cn } from "@/lib/utils";

export function ExternalApiConsole({ config }: { config: ExternalApiConfig }) {
  const router = useRouter();
  const [f, setF] = React.useState<ExternalApiConfig>(config);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, { ok: boolean; message: string; ms?: number }>>({});

  // Chapa multi-account states
  const [chapaAccounts, setChapaAccounts] = React.useState<ChapaAccount[]>([]);
  const [chapaBalances, setChapaBalances] = React.useState<ChapaBalance[]>([]);
  const [chapaTxs, setChapaTxs] = React.useState<ChapaTransaction[]>([]);
  const [selectedChapaAccountId, setSelectedChapaAccountId] = React.useState<string | null>(null);
  const [chapaTestResults, setChapaTestResults] = React.useState<Record<string, { ok: boolean; message: string; balance?: number; mode?: string }>>({});
  const [chapaModalOpen, setChapaModalOpen] = React.useState(false);
  const [chapaForm, setChapaForm] = React.useState({
    id: "",
    name: "",
    secretKey: "",
    publicKey: "",
    webhookSecret: "",
    currency: "ETB",
    active: true,
  });

  // Myseed Verify platform state
  const [verifyConfig, setVerifyConfig] = React.useState({
    enabled: false,
    baseUrl: "https://verify.myseedops.tech",
    apiKey: "",
    hasApiKey: false,
    webhookSecret: "",
    hasWebhookSecret: false,
    environment: "sandbox" as "sandbox" | "production" | "custom",
    autoFulfill: true,
    status: "unconfigured" as "connected" | "unconfigured" | "error",
    lastTestedAt: null as string | null,
    lastError: null as string | null,
  });
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [verifyTesting, setVerifyTesting] = React.useState(false);
  const [verifyTestResult, setVerifyTestResult] = React.useState<{ ok: boolean; message: string; ms?: number } | null>(null);

  React.useEffect(() => {
    getMyseedVerifyConfigAction().then((res) => {
      if (res.ok && res.data) {
        setVerifyConfig(res.data as any);
      }
    });
  }, []);

  // Iconic SMS state
  const [iconicBalance, setIconicBalance] = React.useState<{ balance: number; currency: string } | null>(null);

  const loadChapaData = async (targetAccountId?: string) => {
    const [accRes, balRes, txRes] = await Promise.all([
      listChapaAccountsAction(),
      fetchChapaBalancesAction(),
      listChapaTransactionsAction(targetAccountId || undefined),
    ]);
    if (accRes.ok) {
      setChapaAccounts(accRes.data);
      if (!selectedChapaAccountId && accRes.data.length > 0) {
        setSelectedChapaAccountId(accRes.data[0].id);
      }
    }
    if (balRes.ok) setChapaBalances(balRes.data);
    if (txRes.ok) setChapaTxs(txRes.data);
  };

  React.useEffect(() => {
    loadChapaData();
  }, []);

  const save = async () => {
    setBusy(true);
    const res = await saveExternalApiConfigAction(f);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Failed to save API configuration");
    toast.success("External API Integration Console settings saved.");
    router.refresh();
  };

  const runTest = async (service: "academy" | "finance" | "sms" | "iconicSms") => {
    setTesting(service);
    const res = await testExternalApiAction(service);
    setTesting(null);
    if (!res.ok) {
      setTestResults((prev) => ({ ...prev, [service]: { ok: false, message: res.error || "Connection test failed" } }));
      toast.error(res.error || "Connection failed");
      return;
    }
    const d = res.data;
    setTestResults((prev) => ({ ...prev, [service]: { ok: !!d?.ok, message: d?.message || "", ms: d?.ms } }));
    if (d?.ok) toast.success(`${service.toUpperCase()} connection healthy (${d.ms}ms)`);
    else toast.error(d?.message || "Connection failed");
  };

  const checkIconicBalance = async () => {
    setTesting("iconicBalance");
    const res = await fetchIconicSmsStatusAction();
    setTesting(null);
    if (res.ok && res.data) {
      setIconicBalance({ balance: res.data.balance, currency: res.data.currency });
      toast.success(`Iconic SMS Balance: ${res.data.balance} credits`);
    } else {
      toast.error(!res.ok ? res.error : "Failed to check balance");
    }
  };

  const handleSaveChapaAccount = async () => {
    if (!chapaForm.name.trim()) return toast.error("Business account name is required");
    setBusy(true);
    try {
      const res = await saveChapaAccountAction({
        id: chapaForm.id || undefined,
        name: chapaForm.name,
        secretKey: chapaForm.secretKey || undefined,
        publicKey: chapaForm.publicKey || undefined,
        webhookSecret: chapaForm.webhookSecret || undefined,
        currency: chapaForm.currency,
        active: chapaForm.active,
      });
      setBusy(false);
      if (!res.ok) return toast.error(res.error || "Failed to save Chapa account");
      toast.success(`Chapa account "${chapaForm.name}" saved.`);
      setChapaModalOpen(false);
      setChapaForm({ id: "", name: "", secretKey: "", publicKey: "", webhookSecret: "", currency: "ETB", active: true });
      loadChapaData();
    } catch (err: any) {
      setBusy(false);
      if (String(err?.message || err).includes("Server Action")) {
        toast.error("New deployment detected. Refreshing page...");
        window.location.reload();
      } else {
        toast.error(String(err?.message || err));
      }
    }
  };

  const handleDeleteChapaAccount = async (id: string, name: string) => {
    if (!confirm(`Delete Chapa account "${name}"?`)) return;
    try {
      const res = await deleteChapaAccountAction(id);
      if (!res.ok) return toast.error(res.error || "Failed to delete account");
      toast.success(`Account "${name}" removed.`);
      loadChapaData();
    } catch (err: any) {
      if (String(err?.message || err).includes("Server Action")) {
        toast.error("New deployment detected. Refreshing page...");
        window.location.reload();
      } else {
        toast.error(String(err?.message || err));
      }
    }
  };

  const handleTestChapaAccount = async (id: string) => {
    setTesting(`chapa-${id}`);
    try {
      const res = await testChapaAccountAction(id);
      setTesting(null);
      setChapaTestResults((prev) => ({ ...prev, [id]: res }));
      if (res.ok) {
        toast.success(res.message);
        loadChapaData(selectedChapaAccountId || undefined);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      setTesting(null);
      if (String(err?.message || err).includes("Server Action")) {
        toast.error("New deployment detected. Refreshing page...");
        window.location.reload();
      } else {
        toast.error(String(err?.message || err));
      }
    }
  };

  const handleClearAllChapaAccounts = async () => {
    if (!confirm("Are you sure you want to delete all Chapa accounts and dummy records? This will clear test data permanently.")) return;
    const res = await clearAllChapaAccountsAction();
    if (res.ok) {
      toast.success("All Chapa business accounts removed");
      setChapaAccounts([]);
      setChapaBalances([]);
      setChapaTxs([]);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to clear accounts");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold tracking-tight">External API Integration Console</h2>
          <p className="text-xs text-muted-foreground">
            Configure external integrations: Chapa multi-business payment gateway, Iconic SMS, Customer Support student lookup, and Noor Ethiopia CMS sync.
          </p>
        </div>
        <Button onClick={save} disabled={busy} size="sm">
          {busy ? <Loader2Icon className="size-4 animate-spin mr-1.5" /> : <SaveIcon className="size-4 mr-1.5" />}
          Save API Settings
        </Button>
      </div>

      <Tabs defaultValue="verify" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto p-1">
          <TabsTrigger value="verify" className="flex items-center gap-1.5 text-xs py-2">
            <ShieldCheckIcon className="size-3.5 text-teal-600" /> Myseed Verify
          </TabsTrigger>
          <TabsTrigger value="chapa" className="flex items-center gap-1.5 text-xs py-2">
            <CreditCardIcon className="size-3.5 text-emerald-600" /> Chapa Payments
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-1.5 text-xs py-2">
            <MessageSquareIcon className="size-3.5 text-blue-600" /> SMS & Iconic SMS
          </TabsTrigger>
          <TabsTrigger value="academy" className="flex items-center gap-1.5 text-xs py-2">
            <PhoneCallIcon className="size-3.5 text-purple-600" /> Academy & Support
          </TabsTrigger>
          <TabsTrigger value="finance" className="flex items-center gap-1.5 text-xs py-2">
            <ReceiptIcon className="size-3.5 text-amber-600" /> External Receipts
          </TabsTrigger>
          <TabsTrigger value="noor" className="flex items-center gap-1.5 text-xs py-2">
            <GlobeIcon className="size-3.5 text-indigo-600" /> Noor CMS (Legacy)
          </TabsTrigger>
        </TabsList>

        {/* 0. Myseed Verify Platform Integration */}
        <TabsContent value="verify" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheckIcon className="size-4 text-teal-600" />
                  Myseed Verify Platform Integration
                </CardTitle>
                <CardDescription className="text-xs">
                  Automated transaction verification engine for Ethiopian banks (CBE, Awash, Dashen, BoA), wallets (Telebirr, CBE Birr) and payment gateways with HMAC-signed webhooks.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {verifyConfig.status === "connected" && (
                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50/50">
                    Connected
                  </Badge>
                )}
                {verifyConfig.status === "error" && (
                  <Badge variant="destructive" className="text-xs">
                    Connection Error
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="verify-url" className="text-xs">Platform API Base URL</Label>
                  <Input
                    id="verify-url"
                    value={verifyConfig.baseUrl}
                    onChange={(e) => setVerifyConfig({ ...verifyConfig, baseUrl: e.target.value })}
                    placeholder="https://verify.myseedops.tech"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Address of the deployed Transaction Verify cluster or sandbox endpoint.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="verify-env" className="text-xs">Environment</Label>
                  <select
                    id="verify-env"
                    value={verifyConfig.environment}
                    onChange={(e) => setVerifyConfig({ ...verifyConfig, environment: e.target.value as any })}
                    className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="sandbox">Sandbox (Test Mode)</option>
                    <option value="production">Production (Live Payments)</option>
                    <option value="custom">Custom / Internal Cluster</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">Sandbox allows simulated bank transfers and test OCR slips.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="verify-key" className="text-xs">Server API Key (Bearer Token)</Label>
                  <Input
                    id="verify-key"
                    type="password"
                    value={verifyConfig.apiKey}
                    onChange={(e) => setVerifyConfig({ ...verifyConfig, apiKey: e.target.value })}
                    placeholder={verifyConfig.hasApiKey ? "•••••••••••• (Leave blank to keep saved key)" : "vfy_sec_live_..."}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Server API key used to create payment requests and fetch statuses.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="verify-secret" className="text-xs">Webhook Signing Secret (HMAC SHA-256)</Label>
                  <Input
                    id="verify-secret"
                    type="password"
                    value={verifyConfig.webhookSecret}
                    onChange={(e) => setVerifyConfig({ ...verifyConfig, webhookSecret: e.target.value })}
                    placeholder={verifyConfig.hasWebhookSecret ? "•••••••••••• (Leave blank to keep saved secret)" : "whsec_..."}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Used to verify X-Verify-Signature on incoming callback events.</p>
                </div>
              </div>

              {/* Webhook Callback Information Box */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <GlobeIcon className="size-3.5 text-primary" /> Webhook Ingestion URL
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText("https://myseedops.tech/api/verify/webhook");
                      toast.success("Webhook URL copied to clipboard");
                    }}
                  >
                    <CopyIcon className="size-3" /> Copy
                  </Button>
                </div>
                <code className="block font-mono text-[11px] text-foreground bg-background p-1.5 rounded border">
                  https://myseedops.tech/api/verify/webhook
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Register this URL in your Myseed Verify dashboard under Webhook Endpoints. Subscribed event: <code className="text-foreground">payment.accepted</code>.
                </p>
              </div>

              {/* Switches */}
              <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t">
                <div className="flex items-center justify-between border rounded-lg p-2.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="verify-enable" className="text-xs font-medium cursor-pointer">Enable Verification Service</Label>
                    <p className="text-[10px] text-muted-foreground">Route payment approvals through Myseed Verify</p>
                  </div>
                  <Switch
                    id="verify-enable"
                    checked={verifyConfig.enabled}
                    onCheckedChange={(val) => setVerifyConfig({ ...verifyConfig, enabled: val })}
                  />
                </div>

                <div className="flex items-center justify-between border rounded-lg p-2.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="verify-fulfill" className="text-xs font-medium cursor-pointer">Automatic Fulfillment</Label>
                    <p className="text-[10px] text-muted-foreground">Acknowledge allocation when webhook arrives</p>
                  </div>
                  <Switch
                    id="verify-fulfill"
                    checked={verifyConfig.autoFulfill}
                    onCheckedChange={(val) => setVerifyConfig({ ...verifyConfig, autoFulfill: val })}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    setVerifyBusy(true);
                    try {
                      const res = await saveMyseedVerifyConfigAction(verifyConfig);
                      if (res.ok) {
                        toast.success("Myseed Verify configuration saved");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to save configuration");
                      }
                    } finally {
                      setVerifyBusy(false);
                    }
                  }}
                  disabled={verifyBusy}
                  className="gap-1.5 text-xs"
                >
                  {verifyBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <SaveIcon className="size-3.5" />}
                  Save Settings
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setVerifyTesting(true);
                    setVerifyTestResult(null);
                    try {
                      const res = await testMyseedVerifyConnectionAction();
                      setVerifyTestResult(res);
                      if (res.ok) toast.success(res.message);
                      else toast.error(res.message);
                    } finally {
                      setVerifyTesting(false);
                    }
                  }}
                  disabled={verifyTesting}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCwIcon className={cn("size-3.5", verifyTesting && "animate-spin")} />
                  Test Connection
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const testRef = `test_${Date.now()}`;
                    const res = await createVerifyPaymentRequestAction({
                      externalReference: testRef,
                      currency: "ETB",
                      items: [
                        {
                          title: "Test Subscription Enrollment",
                          minorAmount: "50000", // 500.00 ETB
                          quantity: 1,
                          category: "subscription",
                        },
                      ],
                    });
                    if (res.ok && res.data) {
                      toast.success(`Created Request #${res.data.id} (${res.data.status})`);
                    } else {
                      toast.error(res.error || "Failed to create test request");
                    }
                  }}
                  className="gap-1.5 text-xs"
                >
                  <SparklesIcon className="size-3.5 text-amber-500" />
                  Create Test Payment Request
                </Button>
              </div>

              {verifyTestResult && (
                <div
                  className={cn(
                    "p-3 rounded-lg text-xs border flex items-center justify-between",
                    verifyTestResult.ok
                      ? "bg-emerald-500/10 border-emerald-300 text-emerald-800 dark:text-emerald-300"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {verifyTestResult.ok ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ShieldAlertIcon className="size-4 shrink-0" />
                    )}
                    <span>{verifyTestResult.message}</span>
                  </div>
                  {verifyTestResult.ms !== undefined && (
                    <span className="font-mono text-[10px]">{verifyTestResult.ms}ms</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 1. Chapa Multi-Business Accounts */}
        <TabsContent value="chapa" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCardIcon className="size-4 text-emerald-600" /> Chapa Multi-Business Payment Gateway
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage multiple Chapa merchant accounts for different business arms (e.g. MySeed Subscriptions, MySeed Donations, Academy Tuitions).
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {chapaAccounts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearAllChapaAccounts}
                    className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    Clear All Accounts
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setChapaForm({ id: "", name: "", secretKey: "", publicKey: "", webhookSecret: "", currency: "ETB", active: true });
                    setChapaModalOpen(true);
                  }}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  <PlusIcon className="size-3.5" /> Add Business Account
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Account Balances & Organizations Grid (Interactive Selection) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Select Business Organization / Account
                  </h4>
                  {chapaAccounts.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 text-muted-foreground"
                      onClick={() => {
                        setSelectedChapaAccountId(null);
                        loadChapaData();
                      }}
                    >
                      Show All ({chapaAccounts.length})
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {chapaBalances.length === 0 ? (
                    <div className="col-span-full border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                      No business accounts configured. Click &ldquo;Add Business Account&rdquo; above to connect your Chapa API keys.
                    </div>
                  ) : (
                    chapaBalances.map((bal) => {
                      const isSelected = selectedChapaAccountId === bal.accountId;
                      const testInfo = chapaTestResults[bal.accountId];
                      const isChecking = testing === `chapa-${bal.accountId}`;

                      return (
                        <div
                          key={bal.accountId}
                          onClick={() => {
                            setSelectedChapaAccountId(bal.accountId);
                            loadChapaData(bal.accountId);
                          }}
                          className={cn(
                            "group relative rounded-xl border p-4 space-y-2 cursor-pointer transition-all",
                            isSelected
                              ? "border-emerald-500 bg-emerald-500/[0.04] shadow-sm ring-1 ring-emerald-500/30"
                              : "bg-card hover:border-border/80 hover:bg-muted/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <Building2Icon className={cn("size-4", isSelected ? "text-emerald-600" : "text-muted-foreground")} />
                              {bal.accountName}
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] font-semibold shrink-0",
                                bal.status === "connected" && "bg-emerald-500/10 text-emerald-600",
                                bal.status === "test_mode" && "bg-blue-500/10 text-blue-600",
                                bal.status === "error" && "bg-rose-500/10 text-rose-600"
                              )}
                            >
                              {bal.status === "test_mode" ? "Test Key" : bal.status === "connected" ? "Live Connected" : "Error"}
                            </Badge>
                          </div>

                          <div className="pt-1">
                            <p className="text-xl font-bold tracking-tight text-foreground">
                              {bal.availableBalance.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{bal.currency}</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Ledger Balance: {bal.ledgerBalance.toLocaleString()} {bal.currency}
                            </p>
                          </div>

                          {testInfo && (
                            <div className={cn(
                              "text-[11px] rounded p-1.5 leading-snug border",
                              testInfo.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
                            )}>
                              {testInfo.message}
                            </div>
                          )}

                          <div className="pt-2 flex items-center justify-between border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground">
                              {isSelected ? "● Active View" : "Click to view data"}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1 bg-background"
                              disabled={isChecking}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTestChapaAccount(bal.accountId);
                              }}
                            >
                              {isChecking ? <Loader2Icon className="size-2.5 animate-spin" /> : <RefreshCwIcon className="size-2.5" />}
                              Check Connection
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Accounts Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs">Business Name</TableHead>
                      <TableHead className="text-xs">Public Key</TableHead>
                      <TableHead className="text-xs">Currency</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chapaAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs py-6 text-muted-foreground">
                          No Chapa business accounts configured yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      chapaAccounts.map((acc) => (
                        <TableRow
                          key={acc.id}
                          className={cn("text-xs cursor-pointer", selectedChapaAccountId === acc.id && "bg-muted/40 font-medium")}
                          onClick={() => {
                            setSelectedChapaAccountId(acc.id);
                            loadChapaData(acc.id);
                          }}
                        >
                          <TableCell className="font-semibold text-foreground">
                            <div className="flex items-center gap-1.5">
                              {selectedChapaAccountId === acc.id && <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />}
                              {acc.name}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {acc.publicKey ? acc.publicKey.slice(0, 24) + "..." : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {acc.currency}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px]",
                                acc.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {acc.active ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] px-2"
                                disabled={testing === `chapa-${acc.id}`}
                                onClick={() => handleTestChapaAccount(acc.id)}
                              >
                                {testing === `chapa-${acc.id}` ? <Loader2Icon className="size-3 animate-spin mr-1" /> : <RefreshCwIcon className="size-3 mr-1" />}
                                Check Connection
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] px-2"
                                onClick={() => {
                                  setChapaForm({
                                    id: acc.id,
                                    name: acc.name,
                                    secretKey: "",
                                    publicKey: acc.publicKey,
                                    webhookSecret: "",
                                    currency: acc.currency,
                                    active: acc.active,
                                  });
                                  setChapaModalOpen(true);
                                }}
                              >
                                <PencilIcon className="size-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteChapaAccount(acc.id, acc.name)}
                              >
                                <Trash2Icon className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Recent Transactions Feed */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedChapaAccountId
                      ? `Live Chapa Transactions (${chapaAccounts.find((a) => a.id === selectedChapaAccountId)?.name || "Selected Business"})`
                      : "Recent Chapa Transactions Feed (All Businesses)"}
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    {chapaTxs.length} {chapaTxs.length === 1 ? "transaction" : "transactions"}
                  </span>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-xs">Tx Ref</TableHead>
                        <TableHead className="text-xs">Account</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Method</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-right text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chapaTxs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-xs py-8 text-muted-foreground">
                            No live transactions found for this account on the Chapa gateway API.
                          </TableCell>
                        </TableRow>
                      ) : (
                        chapaTxs.map((tx) => (
                          <TableRow key={tx.id} className="text-xs">
                            <TableCell className="font-mono text-[11px] font-semibold">{tx.txRef}</TableCell>
                            <TableCell>{tx.accountName}</TableCell>
                            <TableCell>
                              {tx.customerName}
                              <div className="text-[10px] text-muted-foreground">{tx.customerEmail}</div>
                            </TableCell>
                            <TableCell>{tx.paymentMethod}</TableCell>
                            <TableCell className="font-semibold">
                              {tx.amount.toLocaleString()} {tx.currency}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px]",
                                  tx.status === "success" && "bg-emerald-500/10 text-emerald-600",
                                  tx.status === "pending" && "bg-amber-500/10 text-amber-600",
                                  tx.status === "failed" && "bg-rose-500/10 text-rose-600"
                                )}
                              >
                                {tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-[11px]">
                              {new Date(tx.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. SMS Gateways & Iconic SMS */}
        <TabsContent value="sms" className="space-y-4">
          {/* Iconic SMS Section */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquareIcon className="size-4 text-emerald-600" /> Iconic SMS Gateway (sms.iconic.et)
                </CardTitle>
                <CardDescription className="text-xs">
                  Ethiopian bulk SMS gateway for parent notifications, course reminders, and receipts.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="iconic-enable" className="text-xs">Enable Iconic SMS</Label>
                <Switch
                  id="iconic-enable"
                  checked={f.iconicSms.enabled}
                  onCheckedChange={(v) => setF({ ...f, iconicSms: { ...f.iconicSms, enabled: v } })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="iconic-url" className="text-xs">Iconic Gateway API URL</Label>
                  <Input
                    id="iconic-url"
                    value={f.iconicSms.baseUrl}
                    onChange={(e) => setF({ ...f, iconicSms: { ...f.iconicSms, baseUrl: e.target.value } })}
                    placeholder="https://sms.iconic.et/api/v1"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="iconic-sender" className="text-xs">Sender ID (Alpha-numeric)</Label>
                  <Input
                    id="iconic-sender"
                    value={f.iconicSms.senderId}
                    onChange={(e) => setF({ ...f, iconicSms: { ...f.iconicSms, senderId: e.target.value } })}
                    placeholder="MYSEED"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="iconic-key" className="text-xs">Iconic SMS API Key / Bearer Token</Label>
                  <Input
                    id="iconic-key"
                    type="password"
                    value={f.iconicSms.apiKey}
                    onChange={(e) => setF({ ...f, iconicSms: { ...f.iconicSms, apiKey: e.target.value } })}
                    placeholder="iconic_live_key_..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t">
                <div className="text-xs flex items-center gap-2">
                  {iconicBalance && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 font-semibold text-xs">
                      Available Credits: {iconicBalance.balance.toLocaleString()}
                    </Badge>
                  )}
                  {testResults.iconicSms && (
                    <span className={cn("text-xs flex items-center gap-1 font-medium", testResults.iconicSms.ok ? "text-emerald-600" : "text-destructive")}>
                      {testResults.iconicSms.ok ? <CheckCircle2Icon className="size-3.5" /> : <XCircleIcon className="size-3.5" />}
                      {testResults.iconicSms.message}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testing === "iconicBalance"}
                    onClick={checkIconicBalance}
                    className="text-xs h-8"
                  >
                    Check Balance
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testing === "iconicSms"}
                    onClick={() => runTest("iconicSms")}
                    className="text-xs h-8"
                  >
                    Test Connection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AfroMessage Section */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquareIcon className="size-4 text-blue-600" /> AfroMessage / Ethio Telecom SMS
                </CardTitle>
                <CardDescription className="text-xs">
                  Secondary fallback SMS gateway route.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sms-enable" className="text-xs">Enable AfroMessage</Label>
                <Switch
                  id="sms-enable"
                  checked={f.sms.enabled}
                  onCheckedChange={(v) => setF({ ...f, sms: { ...f.sms, enabled: v } })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sms-url" className="text-xs">Gateway API URL</Label>
                  <Input
                    id="sms-url"
                    value={f.sms.baseUrl}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, baseUrl: e.target.value } })}
                    placeholder="https://api.afromessage.com/api/v1"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sms-sender" className="text-xs">Sender ID</Label>
                  <Input
                    id="sms-sender"
                    value={f.sms.senderId}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, senderId: e.target.value } })}
                    placeholder="MySeed"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="sms-key" className="text-xs">API Key / Token</Label>
                  <Input
                    id="sms-key"
                    type="password"
                    value={f.sms.apiKey}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, apiKey: e.target.value } })}
                    placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "sms" || !f.sms.baseUrl}
                  onClick={() => runTest("sms")}
                  className="text-xs h-8"
                >
                  Test AfroMessage
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Student Academy API */}
        <TabsContent value="academy" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GlobeIcon className="size-4 text-purple-600" /> Main Academy & Student Portal API
                </CardTitle>
                <CardDescription className="text-xs">
                  Allows Customer Support agents to search for enrolled students and fetch parent phone numbers to call.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="acad-enable" className="text-xs">Enable Integration</Label>
                <Switch
                  id="acad-enable"
                  checked={f.academy.enabled}
                  onCheckedChange={(v) => setF({ ...f, academy: { ...f.academy, enabled: v } })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="acad-url" className="text-xs">Base API URL</Label>
                  <Input
                    id="acad-url"
                    value={f.academy.baseUrl}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, baseUrl: e.target.value } })}
                    placeholder="https://academy.myseed.com.et/api/v1"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="acad-timeout" className="text-xs">Request Timeout (ms)</Label>
                  <Input
                    id="acad-timeout"
                    type="number"
                    value={f.academy.timeoutMs}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, timeoutMs: Number(e.target.value) || 8000 } })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="acad-key" className="text-xs">API Secret Token (Bearer / Header)</Label>
                  <Input
                    id="acad-key"
                    type="password"
                    value={f.academy.apiKey}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, apiKey: e.target.value } })}
                    placeholder="sec_acad_live_..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "academy" || !f.academy.baseUrl}
                  onClick={() => runTest("academy")}
                  className="text-xs h-8"
                >
                  Test Academy Endpoint
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. External Receipts & Finance */}
        <TabsContent value="finance" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ReceiptIcon className="size-4 text-amber-600" /> Finance Revenue & Receipts API
                </CardTitle>
                <CardDescription className="text-xs">
                  Connects to external platform sales revenue and manual bank slip verification.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="fin-enable" className="text-xs">Enable Integration</Label>
                <Switch
                  id="fin-enable"
                  checked={f.finance.enabled}
                  onCheckedChange={(v) => setF({ ...f, finance: { ...f.finance, enabled: v } })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="fin-url" className="text-xs">Finance API Endpoint</Label>
                  <Input
                    id="fin-url"
                    value={f.finance.baseUrl}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, baseUrl: e.target.value } })}
                    placeholder="https://academy.myseed.com.et/api/v1/finance"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fin-timeout" className="text-xs">Timeout (ms)</Label>
                  <Input
                    id="fin-timeout"
                    type="number"
                    value={f.finance.timeoutMs}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, timeoutMs: Number(e.target.value) || 8000 } })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="fin-key" className="text-xs">API Key</Label>
                  <Input
                    id="fin-key"
                    type="password"
                    value={f.finance.apiKey}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, apiKey: e.target.value } })}
                    placeholder="sec_fin_live_..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "finance" || !f.finance.baseUrl}
                  onClick={() => runTest("finance")}
                  className="text-xs h-8"
                >
                  Test Finance Endpoint
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. Noor Ethiopia CMS (Legacy) */}
        <TabsContent value="noor" className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GlobeIcon className="size-4 text-indigo-600" /> Noor Ethiopia CMS (Legacy System)
                </CardTitle>
                <CardDescription className="text-xs">
                  Automated scraping and live mirror of students, parents, plans, and invoices from <code className="text-foreground">cms.noorethiopia.com</code>.
                </CardDescription>
              </div>
              <Button asChild size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                <Link href="/legacy-cms">
                  <ExternalLinkIcon className="size-3.5" /> Open Legacy CMS Viewer
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-semibold text-muted-foreground">Target URL:</span>
                  <span className="font-mono text-foreground">https://cms.noorethiopia.com</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-semibold text-muted-foreground">Scraped Subpages:</span>
                  <span className="text-right">Students, Parents, Subscription Plans, Histories, Invoices, Subscriptions</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-semibold text-muted-foreground">Auto-Sync Status:</span>
                  <span className="text-emerald-600 font-semibold">Enabled (Every 30 Minutes)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-muted-foreground">Customer Support & Finance Access:</span>
                  <span className="text-emerald-600 font-semibold">Active & Searchable</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Chapa Account Modal */}
      <Dialog open={chapaModalOpen} onOpenChange={setChapaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCardIcon className="size-4 text-emerald-600" /> {chapaForm.id ? "Edit Chapa Business Account" : "Add Chapa Business Account"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {chapaForm.id ? "Update business account credentials and settings." : "Add a distinct business sub-account (e.g. \"MySeed Subscriptions\", \"MySeed Donations\") with its own API keys."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="acc-name">Business / Account Name *</Label>
              <Input
                id="acc-name"
                value={chapaForm.name}
                onChange={(e) => setChapaForm({ ...chapaForm, name: e.target.value })}
                placeholder="e.g. MySeed Subscriptions or MySeed Donations"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="acc-sec">Chapa Secret Key (CHASECK_...) {chapaForm.id ? "(Optional if unchanged)" : "*"}</Label>
              <Input
                id="acc-sec"
                type="password"
                value={chapaForm.secretKey}
                onChange={(e) => setChapaForm({ ...chapaForm, secretKey: e.target.value })}
                placeholder={chapaForm.id ? "•••••••• (Leave blank to keep existing key)" : "CHASECK_LIVE-... or CHASECK_TEST-..."}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="acc-pub">Chapa Public Key (CHAPUBK_...)</Label>
              <Input
                id="acc-pub"
                value={chapaForm.publicKey}
                onChange={(e) => setChapaForm({ ...chapaForm, publicKey: e.target.value })}
                placeholder="CHAPUBK_LIVE-... or CHAPUBK_TEST-..."
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="acc-curr">Default Currency</Label>
                <Input
                  id="acc-curr"
                  value={chapaForm.currency}
                  onChange={(e) => setChapaForm({ ...chapaForm, currency: e.target.value.toUpperCase() })}
                  placeholder="ETB"
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center justify-between border rounded-lg px-3 mt-5">
                <Label htmlFor="acc-act" className="cursor-pointer">Active</Label>
                <Switch
                  id="acc-act"
                  checked={chapaForm.active}
                  onCheckedChange={(val) => setChapaForm({ ...chapaForm, active: val })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setChapaModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveChapaAccount} disabled={busy}>
              Save Business Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
