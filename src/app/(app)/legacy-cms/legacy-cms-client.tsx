"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DownloadIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  PhoneCallIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  UsersIcon,
  FileTextIcon,
  CreditCardIcon,
  HistoryIcon,
  SparklesIcon,
  EyeIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertCircleIcon,
  LockIcon,
  DatabaseIcon,
  Trash2Icon,
  LogInIcon,
  LogOutIcon,
  ShieldCheckIcon,
  ActivityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  syncLegacyCmsAction,
  saveLegacyCmsConfigAction,
  listLegacyCmsRecordsAction,
  clearLegacyCmsDataAction,
  saveCmsRoleVisibilityAction,
  loginLegacyCmsAction,
  checkLegacyCmsAuthAction,
  logoutLegacyCmsAction,
} from "@/app/actions/legacy-cms";
import type {
  LegacyCmsCategory,
  LegacyCmsConfig,
  LegacyCmsRecord,
  CmsRoleVisibility,
} from "@/server/legacy-cms";
import { cn } from "@/lib/utils";

const CATEGORY_PATHS: Record<LegacyCmsCategory, string> = {
  students: "/admin/students",
  parents: "/admin/parents",
  "subscription-plans": "/admin/subscription-plans",
  "subscription-histories": "/admin/subscription-histories",
  invoices: "/admin/invoices",
  subscriptions: "/admin/subscriptions",
};

export function LegacyCmsClient({
  config,
  initialCategory,
  initialRecords,
  stats,
  isAdmin = true,
  allowedCategories = ["students", "parents", "subscriptions", "invoices", "subscription-plans", "subscription-histories"],
  visibility,
}: {
  config: LegacyCmsConfig;
  initialCategory: LegacyCmsCategory;
  initialRecords: { rows: LegacyCmsRecord[]; total: number };
  stats: {
    studentsCount: number;
    parentsCount: number;
    plansCount: number;
    activeSubscriptionsCount: number;
    invoicesCount: number;
    lastSyncedAt: string | null;
  };
  isAdmin?: boolean;
  allowedCategories?: LegacyCmsCategory[];
  visibility?: CmsRoleVisibility;
}) {
  const router = useRouter();
  const [category, setCategory] = React.useState<LegacyCmsCategory>(initialCategory);
  const [records, setRecords] = React.useState(initialRecords.rows);
  const [total, setTotal] = React.useState(initialRecords.total);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<LegacyCmsRecord | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Authentication & Session Status
  const [authStatus, setAuthStatus] = React.useState<{
    status: "checking" | "connected" | "disconnected" | "error";
    username: string;
    message: string;
    ms?: number;
  }>({
    status: config.hasSessionCookie || config.username ? "checking" : "disconnected",
    username: config.username || "ops@myseed.com",
    message: "Checking Noor CMS session...",
  });
  const [checkingAuth, setCheckingAuth] = React.useState(false);
  const [loginModalOpen, setLoginModalOpen] = React.useState(false);
  const [loginForm, setLoginForm] = React.useState({
    username: config.username || "ops@myseed.com",
    password: "",
  });

  // Selectable Target Page for Sync
  const [targetSyncPage, setTargetSyncPage] = React.useState<"all" | LegacyCmsCategory>("all");

  const [roleVisibility, setRoleVisibility] = React.useState<CmsRoleVisibility>(
    visibility || {
      admin: ["students", "parents", "subscription-plans", "subscription-histories", "invoices", "subscriptions"],
      support: ["students", "parents", "subscriptions", "subscription-plans"],
      finance: ["invoices", "subscription-plans", "subscription-histories", "subscriptions"],
    }
  );

  // Settings form
  const [cfg, setCfg] = React.useState({
    baseUrl: config.baseUrl || "https://cms.noorethiopia.com",
    username: config.username || "ops@myseed.com",
    password: "",
    sessionCookie: "",
    autoSync: config.autoSync,
    syncIntervalMinutes: config.syncIntervalMinutes,
  });

  const handleCheckAuthStatus = async (showToast = false) => {
    setCheckingAuth(true);
    setAuthStatus((prev) => ({ ...prev, status: "checking", message: "Verifying session with Noor CMS..." }));
    const res = await checkLegacyCmsAuthAction();
    setCheckingAuth(false);
    if (res.ok) {
      setAuthStatus({
        status: "connected",
        username: res.username || config.username || "ops@myseed.com",
        message: res.message,
        ms: res.ms,
      });
      if (showToast) toast.success(`Noor CMS session verified (${res.ms}ms)`);
    } else {
      setAuthStatus({
        status: res.status as "disconnected" | "error",
        username: res.username || config.username || "ops@myseed.com",
        message: res.message,
        ms: res.ms,
      });
      if (showToast) toast.error(res.message);
    }
  };

  React.useEffect(() => {
    void handleCheckAuthStatus(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoginSubmit = async () => {
    if (!loginForm.username.trim()) return toast.error("Email/Username is required");
    setLoading(true);
    const res = await loginLegacyCmsAction({
      username: loginForm.username.trim(),
      password: loginForm.password ? loginForm.password : undefined,
    });
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setAuthStatus({
        status: "connected",
        username: loginForm.username.trim(),
        message: "Session established and verified",
      });
      setLoginModalOpen(false);
      router.refresh();
      void fetchCategoryData(category, search);
    } else {
      toast.error(res.message || "Login failed");
    }
  };

  const handleLogout = async () => {
    if (!confirm("Log out from Noor Ethiopia CMS? This will clear the active session cookie.")) return;
    setLoading(true);
    const res = await logoutLegacyCmsAction();
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setAuthStatus({
        status: "disconnected",
        username: config.username || "ops@myseed.com",
        message: "Logged out. Session cleared.",
      });
      router.refresh();
    } else {
      toast.error(res.message || "Logout failed");
    }
  };

  const fetchCategoryData = async (cat: LegacyCmsCategory, query = search) => {
    setLoading(true);
    const res = await listLegacyCmsRecordsAction(cat, { q: query, limit: 100 });
    setLoading(false);
    if (res.ok) {
      setRecords(res.data.rows);
      setTotal(res.data.total);
    } else {
      toast.error(res.error || "Failed to load data");
    }
  };

  const handleTabChange = (val: string) => {
    const nextCat = val as LegacyCmsCategory;
    setCategory(nextCat);
    fetchCategoryData(nextCat, search);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    fetchCategoryData(category, val);
  };

  const handleSyncTargetPage = async (catToSync: "all" | LegacyCmsCategory = targetSyncPage) => {
    setSyncing(true);
    const res = await syncLegacyCmsAction({ force: true, category: catToSync });
    setSyncing(false);
    if (res.ok) {
      toast.success(res.message || `Synced successfully for ${catToSync}`);
      await handleCheckAuthStatus(false);
      await fetchCategoryData(category, search);
      router.refresh();
    } else {
      toast.error(res.error || "Sync failed");
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    const res = await saveLegacyCmsConfigAction({
      baseUrl: cfg.baseUrl,
      username: cfg.username,
      password: cfg.password ? cfg.password : undefined,
      sessionCookie: cfg.sessionCookie ? cfg.sessionCookie : undefined,
      autoSync: cfg.autoSync,
      syncIntervalMinutes: cfg.syncIntervalMinutes,
    });
    if (res.ok) {
      await saveCmsRoleVisibilityAction(roleVisibility);
      toast.success("Legacy CMS credentials and role visibility settings saved");
      setSettingsOpen(false);
      router.refresh();
      void handleCheckAuthStatus(false);
    } else {
      toast.error(res.error || "Failed to save settings");
    }
    setLoading(false);
  };

  const handleClearCmsData = async () => {
    if (!confirm("Are you sure you want to clear all synced Noor Ethiopia CMS records? This will delete all cached records and leave the tables empty.")) return;
    setLoading(true);
    const res = await clearLegacyCmsDataAction();
    setLoading(false);
    if (res.ok) {
      toast.success("All Legacy CMS records cleared successfully");
      setRecords([]);
      setTotal(0);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to clear records");
    }
  };

  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success(`Copied: ${txt}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportData = (format: "csv" | "json") => {
    if (records.length === 0) return toast.error("No data to export");
    const filename = `noor-cms-${category}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "json") {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records.map((r) => r.data), null, 2));
      const el = document.createElement("a");
      el.setAttribute("href", dataStr);
      el.setAttribute("download", `${filename}.json`);
      document.body.appendChild(el);
      el.click();
      el.remove();
      toast.success("Exported JSON");
    } else {
      const keys = Array.from(new Set(records.flatMap((r) => Object.keys(r.data))));
      const csvRows = [
        keys.join(","),
        ...records.map((r) =>
          keys
            .map((k) => {
              const val = String(r.data[k] ?? "");
              return `"${val.replace(/"/g, '""')}"`;
            })
            .join(",")
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.setAttribute("href", url);
      el.setAttribute("download", `${filename}.csv`);
      document.body.appendChild(el);
      el.click();
      el.remove();
      toast.success("Exported CSV");
    }
  };

  const filteredRecords = React.useMemo(() => {
    if (statusFilter === "all") return records;
    return records.filter((r) => {
      const st = String(r.data.status || r.data.Status || "").toLowerCase();
      return st.includes(statusFilter.toLowerCase());
    });
  }, [records, statusFilter]);

  const columns = React.useMemo(() => {
    if (records.length === 0) return [];
    const firstKeys = Object.keys(records[0].data);
    return firstKeys.slice(0, 7);
  }, [records]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight">
                Noor Ethiopia CMS (Legacy)
              </CardTitle>
              <Badge variant="outline" className="border-[#9334E6]/30 text-[#9334E6] dark:text-[#C58AF9]">
                Live Mirror
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Direct connection to <code className="font-mono text-foreground font-semibold">https://cms.noorethiopia.com</code> with Livewire authentication and page scraping.
            </CardDescription>
          </div>

          {/* Session Status & Quick Login / Logout Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
              {authStatus.status === "connected" && (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Connected: {authStatus.username}
                  </span>
                  {authStatus.ms !== undefined && (
                    <span className="text-[11px] text-muted-foreground">({authStatus.ms}ms)</span>
                  )}
                </>
              )}
              {authStatus.status === "disconnected" && (
                <>
                  <span className="size-2 rounded-full bg-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Logged Out / Disconnected
                  </span>
                </>
              )}
              {authStatus.status === "checking" && (
                <>
                  <RefreshCwIcon className="size-3 animate-spin text-primary" />
                  <span className="text-muted-foreground">Checking session...</span>
                </>
              )}
              {authStatus.status === "error" && (
                <>
                  <span className="size-2 rounded-full bg-rose-500" />
                  <span className="font-medium text-destructive">Connection Error</span>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={checkingAuth}
              onClick={() => handleCheckAuthStatus(true)}
              className="h-8 gap-1 text-xs"
              title="Test connection and check live login status"
            >
              <ActivityIcon className={cn("size-3.5 text-primary", checkingAuth && "animate-spin")} />
              Check Status
            </Button>

            {isAdmin && (
              <>
                {authStatus.status === "connected" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={handleLogout}
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <LogOutIcon className="size-3.5" />
                    Log Out
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setLoginModalOpen(true)}
                    className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    <LogInIcon className="size-3.5" />
                    Log In to CMS
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Settings2Icon className="size-3.5" />
                  Credentials & Roles
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {/* Target Page Selector & Scraper Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-muted-foreground">Target Page to Sync:</span>
            <select
              value={targetSyncPage}
              onChange={(e) => setTargetSyncPage(e.target.value as "all" | LegacyCmsCategory)}
              className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
            >
              <option value="all">All 6 Subpages (Students, Parents, Subscriptions, Invoices, Plans, Histories)</option>
              <option value="students">Students (/admin/students)</option>
              <option value="parents">Parents (/admin/parents)</option>
              <option value="subscriptions">Active Subscriptions (/admin/subscriptions)</option>
              <option value="invoices">Invoices (/admin/invoices)</option>
              <option value="subscription-plans">Subscription Plans (/admin/subscription-plans)</option>
              <option value="subscription-histories">Subscription Histories (/admin/subscription-histories)</option>
            </select>

            {isAdmin && (
              <Button
                size="sm"
                onClick={() => handleSyncTargetPage(targetSyncPage)}
                disabled={syncing}
                className="h-8 gap-1.5 bg-[#00522B] text-white hover:bg-[#003d20] text-xs font-semibold"
              >
                <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
                {syncing
                  ? `Scraping ${targetSyncPage}...`
                  : targetSyncPage === "all"
                  ? "Sync All Pages"
                  : `Sync Target Page (${targetSyncPage})`}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
              <ClockIcon className="size-3 text-muted-foreground" />
              <span>Last synced: {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : "Never"}</span>
            </div>

            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCmsData}
                disabled={loading}
                className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2Icon className="size-3.5" /> Clear All Records
              </Button>
            )}
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-5 sm:divide-y-0">
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Students</p>
            <p className="text-lg font-bold text-foreground">{stats.studentsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Parents</p>
            <p className="text-lg font-bold text-foreground">{stats.parentsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Active Subscriptions</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.activeSubscriptionsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Plans</p>
            <p className="text-lg font-bold text-foreground">{stats.plansCount}</p>
          </div>
          <div className="col-span-2 p-3 text-center sm:col-span-1">
            <p className="text-[11px] font-medium text-muted-foreground">Invoices</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.invoicesCount}</p>
          </div>
        </div>
      </Card>

      {/* Main Tabs & Table View */}
      <Tabs value={category} onValueChange={handleTabChange} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-10 p-1 flex-wrap">
            {allowedCategories.includes("students") && (
              <TabsTrigger value="students" className="gap-1.5 text-xs font-medium">
                <GraduationCapIcon className="size-3.5" /> Students
              </TabsTrigger>
            )}
            {allowedCategories.includes("parents") && (
              <TabsTrigger value="parents" className="gap-1.5 text-xs font-medium">
                <UsersIcon className="size-3.5" /> Parents
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscriptions") && (
              <TabsTrigger value="subscriptions" className="gap-1.5 text-xs font-medium">
                <CreditCardIcon className="size-3.5" /> Subscriptions
              </TabsTrigger>
            )}
            {allowedCategories.includes("invoices") && (
              <TabsTrigger value="invoices" className="gap-1.5 text-xs font-medium">
                <FileTextIcon className="size-3.5" /> Invoices
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-plans") && (
              <TabsTrigger value="subscription-plans" className="gap-1.5 text-xs font-medium">
                <SparklesIcon className="size-3.5" /> Plans
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-histories") && (
              <TabsTrigger value="subscription-histories" className="gap-1.5 text-xs font-medium">
                <HistoryIcon className="size-3.5" /> Histories
              </TabsTrigger>
            )}
          </TabsList>

          {/* Search & Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${category}...`}
                value={search}
                onChange={handleSearchChange}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <DownloadIcon className="size-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportData("csv")}>
                  Export as CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportData("json")}>
                  Export as JSON (.json)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSyncTargetPage(category)}
                disabled={syncing}
                className="h-9 gap-1 text-xs"
                title={`Sync only the active tab (${category})`}
              >
                <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
                Sync Active Tab
              </Button>
            )}
          </div>
        </div>

        {/* Tab Content & Tables */}
        {(["students", "parents", "subscriptions", "invoices", "subscription-plans", "subscription-histories"] as LegacyCmsCategory[]).map(
          (cat) =>
            allowedCategories.includes(cat) && (
              <TabsContent key={cat} value={cat} className="space-y-4">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            {columns.length > 0 ? (
                              columns.map((c) => (
                                <TableHead key={c} className="text-xs font-semibold capitalize">
                                  {c.replace(/_/g, " ")}
                                </TableHead>
                              ))
                            ) : (
                              <TableHead className="text-xs">Data</TableHead>
                            )}
                            <TableHead className="w-24 text-right text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loading ? (
                            <TableRow>
                              <TableCell colSpan={Math.max(2, columns.length + 1)} className="py-12 text-center text-xs text-muted-foreground">
                                <RefreshCwIcon className="mx-auto mb-2 size-5 animate-spin text-primary" />
                                Loading {cat} data...
                              </TableCell>
                            </TableRow>
                          ) : filteredRecords.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={Math.max(2, columns.length + 1)} className="py-12 text-center text-xs text-muted-foreground">
                                No records found in {cat}. Click &quot;Sync Target Page&quot; or &quot;Log In to CMS&quot; to fetch live data.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredRecords.map((r) => (
                              <TableRow key={r.id} className="text-xs hover:bg-muted/30">
                                {columns.length > 0 ? (
                                  columns.map((colKey) => {
                                    const val = r.data[colKey];
                                    const isPhone = colKey.toLowerCase().includes("phone");
                                    const isEmail = colKey.toLowerCase().includes("email");

                                    return (
                                      <TableCell key={colKey} className="py-2.5 font-medium">
                                        {isPhone && val ? (
                                          <div className="flex items-center gap-1.5">
                                            <a
                                              href={`tel:${String(val)}`}
                                              className="flex items-center gap-1 font-mono text-primary hover:underline"
                                            >
                                              <PhoneCallIcon className="size-3 text-emerald-600" />
                                              {String(val)}
                                            </a>
                                            <button
                                              type="button"
                                              onClick={() => copyText(String(val), `${r.id}-${colKey}`)}
                                              className="text-muted-foreground hover:text-foreground"
                                              title="Copy Phone"
                                            >
                                              {copiedKey === `${r.id}-${colKey}` ? (
                                                <CheckIcon className="size-3 text-emerald-600" />
                                              ) : (
                                                <CopyIcon className="size-3" />
                                              )}
                                            </button>
                                          </div>
                                        ) : isEmail && val ? (
                                          <a
                                            href={`mailto:${String(val)}`}
                                            className="text-primary hover:underline truncate max-w-xs block"
                                          >
                                            {String(val)}
                                          </a>
                                        ) : typeof val === "string" && (val === "Active" || val === "Yes" || val === "Paid" || val === "Verified") ? (
                                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                            {val}
                                          </Badge>
                                        ) : typeof val === "string" && (val === "Expired" || val === "No" || val === "Inactive") ? (
                                          <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                                            {val}
                                          </Badge>
                                        ) : (
                                          <span className="truncate max-w-xs block text-foreground">
                                            {val !== undefined && val !== null ? String(val) : "—"}
                                          </span>
                                        )}
                                      </TableCell>
                                    );
                                  })
                                ) : (
                                  <TableCell className="font-mono text-xs">{JSON.stringify(r.data)}</TableCell>
                                )}
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedRecord(r)}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    <EyeIcon className="size-3 mr-1" /> View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )
        )}
      </Tabs>

      {/* Record Inspector Modal */}
      <Dialog open={!!selectedRecord} onOpenChange={(o) => !o && setSelectedRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon className="size-4 text-primary" /> {selectedRecord?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              External ID: <code className="font-mono text-foreground font-semibold">{selectedRecord?.externalId}</code> | Category: {selectedRecord?.category}
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs">
              {Object.entries(selectedRecord.data).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}:</span>
                  <span className="font-medium text-foreground text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Explicit Login Modal */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <LogInIcon className="size-4 text-emerald-600" /> Log In to Noor Ethiopia CMS
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter admin credentials for <code className="text-foreground">https://cms.noorethiopia.com</code> to authenticate and establish a live session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="login-user">Email / Username</Label>
              <Input
                id="login-user"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="ops@myseed.com"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="login-pass">Password</Label>
              <Input
                id="login-pass"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="Leave blank to use default (9V7x6antUAU6eyE)"
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Credentials are automatically sealed and authenticated via Livewire.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoginModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleLoginSubmit}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading && <RefreshCwIcon className="mr-1.5 size-3.5 animate-spin" />}
              Log In & Establish Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings & Credentials Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <LockIcon className="size-4 text-primary" /> Noor Ethiopia CMS Settings
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure scraping credentials, background sync, and role category visibility.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <Label htmlFor="base-url">CMS Base URL</Label>
              <Input
                id="base-url"
                value={cfg.baseUrl}
                onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
                placeholder="https://cms.noorethiopia.com"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="cms-user">Username / Email</Label>
                <Input
                  id="cms-user"
                  value={cfg.username}
                  onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
                  placeholder="ops@myseed.com"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cms-pass">Password</Label>
                <Input
                  id="cms-pass"
                  type="password"
                  value={cfg.password}
                  onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
                  placeholder={config.hasPassword ? "•••••••• (Saved)" : "CMS password"}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="cms-cookie">Session Cookie</Label>
                <span className="text-[10px] text-emerald-600 font-medium">Captured automatically</span>
              </div>
              <Input
                id="cms-cookie"
                type="password"
                value={cfg.sessionCookie}
                onChange={(e) => setCfg({ ...cfg, sessionCookie: e.target.value })}
                placeholder={config.hasSessionCookie ? "•••••••• (Live session cookie active)" : "Automatically extracted from Livewire"}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                You do not need to paste cookies manually. The system automatically captures and renews the Livewire session cookie in the background.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="auto-sync" className="cursor-pointer">Automatic Background Sync</Label>
                <p className="text-[11px] text-muted-foreground">Periodically syncs new students and invoices.</p>
              </div>
              <Switch
                id="auto-sync"
                checked={cfg.autoSync}
                onCheckedChange={(val) => setCfg({ ...cfg, autoSync: val })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sync-interval">Sync Interval (Minutes)</Label>
              <Input
                id="sync-interval"
                type="number"
                min={5}
                max={1440}
                value={cfg.syncIntervalMinutes}
                onChange={(e) => setCfg({ ...cfg, syncIntervalMinutes: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>

            {/* Category Visibility for Non-Admins */}
            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <p className="font-semibold text-foreground text-xs">Role Visibility (Control what Support & Finance can see)</p>
              <div className="space-y-3 pt-1">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium pb-1">Customer Support sees:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["students", "parents", "subscriptions", "subscription-plans", "invoices", "subscription-histories"] as LegacyCmsCategory[]).map((cat) => {
                      const enabled = (roleVisibility.support || []).includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const cur = roleVisibility.support || [];
                            const next = enabled ? cur.filter((x) => x !== cat) : [...cur, cat];
                            setRoleVisibility({ ...roleVisibility, support: next });
                          }}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                            enabled ? "bg-primary text-primary-foreground font-medium" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-muted-foreground font-medium pb-1">Finance sees:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["invoices", "subscriptions", "subscription-plans", "subscription-histories", "students", "parents"] as LegacyCmsCategory[]).map((cat) => {
                      const enabled = (roleVisibility.finance || []).includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const cur = roleVisibility.finance || [];
                            const next = enabled ? cur.filter((x) => x !== cat) : [...cur, cat];
                            setRoleVisibility({ ...roleVisibility, finance: next });
                          }}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                            enabled ? "bg-primary text-primary-foreground font-medium" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveSettings} disabled={loading}>
              Save Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
