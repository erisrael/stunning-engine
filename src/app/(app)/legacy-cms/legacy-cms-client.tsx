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
  TrendingUpIcon,
  DollarSignIcon,
  PhoneForwardedIcon,
  FileSpreadsheetIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  LayersIcon,
  PercentIcon,
  FilterIcon,
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
  getStudentParentRelationsAction,
  getLegacyCmsRevenueAnalyticsAction,
  approveLegacyCmsInvoiceAction,
  getLegacyCmsGrowthAnalyticsAction,
} from "@/app/actions/legacy-cms";
import type {
  LegacyCmsCategory,
  LegacyCmsConfig,
  LegacyCmsRecord,
  CmsRoleVisibility,
  StudentParentRelation,
  RevenueAnalytics,
  GrowthAnalytics,
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
  initialRelations,
  initialRevenue,
  initialGrowth,
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
  initialRelations?: {
    relations: StudentParentRelation[];
    summary: { totalStudents: number; linkedParents: number; withPhone: number; activeSubscriptions: number };
  };
  initialRevenue?: RevenueAnalytics;
  initialGrowth?: GrowthAnalytics;
}) {
  const router = useRouter();

  // Top-level Navigation Mode: "subpages" | "relations" | "revenue" | "growth"
  const [activeMainView, setActiveMainView] = React.useState<"subpages" | "relations" | "revenue" | "growth">("subpages");

  // Category Tables State
  const [category, setCategory] = React.useState<LegacyCmsCategory>(initialCategory);
  const [records, setRecords] = React.useState(initialRecords.rows);
  const [total, setTotal] = React.useState(initialRecords.total);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [gradeFilter, setGradeFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [deepSyncing, setDeepSyncing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<LegacyCmsRecord | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Student-Parent Relations State
  const [relations, setRelations] = React.useState<StudentParentRelation[]>(initialRelations?.relations || []);
  const [relationsSummary, setRelationsSummary] = React.useState(
    initialRelations?.summary || { totalStudents: 0, linkedParents: 0, withPhone: 0, activeSubscriptions: 0 }
  );
  const [relSearch, setRelSearch] = React.useState("");
  const [relGradeFilter, setRelGradeFilter] = React.useState("all");
  const [relPhoneOnly, setRelPhoneOnly] = React.useState(false);

  // Revenue & Invoices State
  const [revenueData, setRevenueData] = React.useState<RevenueAnalytics>(
    initialRevenue || {
      summary: { totalRevenue: 0, totalPaidCount: 0, pendingApprovalRevenue: 0, pendingApprovalCount: 0, averageInvoiceValue: 0 },
      byPaymentMethod: [],
      byStatus: [],
      byMonth: [],
      byPlan: [],
      invoices: [],
    }
  );
  const [revMethodFilter, setRevMethodFilter] = React.useState("all");
  const [revStatusFilter, setRevStatusFilter] = React.useState("all");
  const [revSearch, setRevSearch] = React.useState("");

  // Growth Analytics State
  const [growthData, setGrowthData] = React.useState<GrowthAnalytics>(
    initialGrowth || {
      summary: { totalStudents: 0, totalParents: 0, totalInvoices: 0, activeSubscriptions: 0, conversionRate: 0 },
      gradeDistribution: [],
      cityDemographics: [],
      planPopularity: [],
      genderBreakdown: [],
    }
  );

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
    username: config.username === "ops@admin.com" ? "ops@myseed.com" : (config.username || "ops@myseed.com"),
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
    username: config.username === "ops@admin.com" ? "ops@myseed.com" : (config.username || "ops@myseed.com"),
    password: "",
    sessionCookie: "",
    autoSync: config.autoSync,
    syncIntervalMinutes: config.syncIntervalMinutes,
  });

  const handleCheckAuthStatus = async (showToast = false) => {
    setCheckingAuth(true);
    setAuthStatus((prev) => ({ ...prev, status: "checking", message: "Verifying session with Noor CMS..." }));
    try {
      const res = await checkLegacyCmsAuthAction();
      setCheckingAuth(false);
      if (res.ok) {
        setAuthStatus({
          status: "connected",
          username: res.username || "ops@myseed.com",
          message: res.message,
          ms: res.ms,
        });
        if (showToast) toast.success(`Noor CMS session verified (${res.ms}ms)`);
      } else {
        setAuthStatus({
          status: res.status as "disconnected" | "error",
          username: res.username || "ops@myseed.com",
          message: res.message,
          ms: res.ms,
        });
        if (showToast) toast.error(res.message);
      }
    } catch (err: any) {
      setCheckingAuth(false);
      if (String(err?.message || err).includes("Server Action")) {
        window.location.reload();
      }
    }
  };

  React.useEffect(() => {
    void handleCheckAuthStatus(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAllViews = async () => {
    const [catRes, relRes, revRes, groRes] = await Promise.all([
      listLegacyCmsRecordsAction(category, { q: search, limit: 100 }),
      getStudentParentRelationsAction(),
      getLegacyCmsRevenueAnalyticsAction(),
      getLegacyCmsGrowthAnalyticsAction(),
    ]);
    if (catRes.ok) {
      setRecords(catRes.data.rows);
      setTotal(catRes.data.total);
    }
    if (relRes.ok) {
      setRelations(relRes.data.relations);
      setRelationsSummary(relRes.data.summary);
    }
    if (revRes.ok) setRevenueData(revRes.data);
    if (groRes.ok) setGrowthData(groRes.data);
    router.refresh();
  };

  const handleLoginSubmit = async () => {
    let userToUse = loginForm.username.trim() || "ops@myseed.com";
    if (userToUse === "ops@admin.com") userToUse = "ops@myseed.com";
    setLoading(true);
    try {
      const res = await loginLegacyCmsAction({
        username: userToUse,
        password: loginForm.password.trim() || undefined,
      });
      setLoading(false);
      if (res.ok) {
        toast.success(res.message);
        setAuthStatus({
          status: "connected",
          username: userToUse,
          message: "Session established and verified",
        });
        setLoginModalOpen(false);
        await refreshAllViews();
      } else {
        toast.error(res.message || "Login failed");
      }
    } catch (err: any) {
      setLoading(false);
      if (String(err?.message || err).includes("Server Action")) {
        toast.error("New deployment detected. Refreshing page...");
        window.location.reload();
      } else {
        toast.error(String(err?.message || err));
      }
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

  // Standard Sync (Target page or all)
  const handleSyncTargetPage = async (catToSync: "all" | LegacyCmsCategory = targetSyncPage) => {
    setSyncing(true);
    const res = await syncLegacyCmsAction({ force: true, category: catToSync });
    setSyncing(false);
    if (res.ok) {
      toast.success(res.message || `Synced successfully for ${catToSync}`);
      await handleCheckAuthStatus(false);
      await refreshAllViews();
    } else {
      toast.error(res.error || "Sync failed");
    }
  };

  // Deep Multi-Page Crawl (Crawl all available pages)
  const handleDeepSync = async () => {
    setDeepSyncing(true);
    toast.info(`Starting deep crawl for ${targetSyncPage === "all" ? "all subpages" : targetSyncPage}... Crawling across all pages.`);
    const res = await syncLegacyCmsAction({ force: true, category: targetSyncPage, deep: true, maxPages: 100 });
    setDeepSyncing(false);
    if (res.ok) {
      toast.success(res.message);
      await refreshAllViews();
    } else {
      toast.error(res.error || "Deep sync failed");
    }
  };

  const handleApproveInvoice = async (invoiceId: string) => {
    if (!confirm("Confirm receipt verification? This invoice will be approved and marked as Paid.")) return;
    const res = await approveLegacyCmsInvoiceAction(invoiceId);
    if (res.ok) {
      toast.success(res.message);
      const revRes = await getLegacyCmsRevenueAnalyticsAction();
      if (revRes.ok) setRevenueData(revRes.data);
    } else {
      toast.error(res.message || "Failed to approve invoice");
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
      setRelations([]);
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

  // Generic Export to Excel (.csv format with UTF-8 BOM)
  const exportToExcel = (
    filename: string,
    headers: string[],
    rows: (string | number | boolean | null | undefined)[][]
  ) => {
    if (rows.length === 0) return toast.error("No data to export");
    const sanitize = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvContent =
      "\uFEFF" + // UTF-8 BOM so Microsoft Excel renders Amharic, special characters and phone symbols accurately
      headers.map(sanitize).join(",") +
      "\r\n" +
      rows.map((row) => row.map(sanitize).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}.csv (Excel compatible)`);
  };

  const exportCurrentTableToExcel = () => {
    if (filteredRecords.length === 0) return toast.error("No data in current table");
    const headers = Array.from(new Set(filteredRecords.flatMap((r) => Object.keys(r.data))));
    const rows = filteredRecords.map((r) => headers.map((h) => String(r.data[h] ?? "")));
    exportToExcel(`noor-cms-${category}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const exportRelationsToExcel = () => {
    if (filteredRelations.length === 0) return toast.error("No relations to export");
    const headers = ["Student ID", "Student Name", "Grade", "City", "Gender", "Subscription Status", "Plan", "Parent Name", "Parent Phone", "Parent Email", "Link Type"];
    const rows = filteredRelations.map((r) => [
      r.studentId,
      r.studentName,
      r.grade,
      r.city,
      r.gender,
      r.subscriptionStatus,
      r.planName || "",
      r.parentName,
      r.parentPhone,
      r.parentEmail || "",
      r.hasDirectLink ? "Direct Link" : "Subscription Phone",
    ]);
    exportToExcel(`noor-student-parent-directory-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const exportRevenueToExcel = () => {
    if (filteredInvoices.length === 0) return toast.error("No invoices to export");
    const headers = ["Invoice ID", "Student Name", "Plan", "Amount (ETB)", "Payment Method", "Status", "Date", "Reason", "Approval State", "Approved By", "Approved At"];
    const rows = filteredInvoices.map((inv) => [
      inv.externalId,
      inv.student,
      inv.plan,
      inv.amount,
      inv.paymentMethod,
      inv.status,
      inv.date,
      inv.reason,
      inv.needsApproval ? "Needs Approval" : "Approved / Paid",
      inv.approvedBy || "",
      inv.approvedAt || "",
    ]);
    exportToExcel(`noor-revenue-invoices-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  // Filtered Records for Active Category
  const filteredRecords = React.useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== "all") {
        const st = String(r.data.status || r.data.Status || r.data.Subscription || "").toLowerCase();
        if (!st.includes(statusFilter.toLowerCase())) return false;
      }
      if (gradeFilter !== "all") {
        const gr = String(r.data.grade || r.data.Grade || "").toLowerCase();
        if (!gr.includes(gradeFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [records, statusFilter, gradeFilter]);

  // Filtered Student-Parent Relations
  const filteredRelations = React.useMemo(() => {
    return relations.filter((rel) => {
      if (relGradeFilter !== "all" && !rel.grade.toLowerCase().includes(relGradeFilter.toLowerCase())) {
        return false;
      }
      if (relPhoneOnly && !rel.hasPhone) {
        return false;
      }
      if (relSearch.trim()) {
        const q = relSearch.toLowerCase();
        const match =
          rel.studentName.toLowerCase().includes(q) ||
          rel.parentName.toLowerCase().includes(q) ||
          rel.parentPhone.includes(q) ||
          rel.city.toLowerCase().includes(q) ||
          rel.studentId.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [relations, relGradeFilter, relPhoneOnly, relSearch]);

  // Filtered Invoices in Revenue View
  const filteredInvoices = React.useMemo(() => {
    return revenueData.invoices.filter((inv) => {
      if (revMethodFilter !== "all" && !inv.paymentMethod.toLowerCase().includes(revMethodFilter.toLowerCase())) {
        return false;
      }
      if (revStatusFilter !== "all") {
        if (revStatusFilter === "needs_approval" && !inv.needsApproval) return false;
        if (revStatusFilter === "paid" && inv.status !== "paid") return false;
      }
      if (revSearch.trim()) {
        const q = revSearch.toLowerCase();
        const match = inv.student.toLowerCase().includes(q) || inv.plan.toLowerCase().includes(q) || inv.reason.toLowerCase().includes(q) || inv.externalId.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [revenueData.invoices, revMethodFilter, revStatusFilter, revSearch]);

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
                Noor Ethiopia CMS
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                Filament v3 & Livewire
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Synchronized operational database mirror for <code className="text-foreground">https://cms.noorethiopia.com</code> with deep multi-page scraping, parent-student linkage, and revenue approval.
            </CardDescription>
          </div>

          {/* Connection Pill & Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs shadow-sm bg-muted/40">
              {authStatus.status === "connected" && (
                <>
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Connected ({authStatus.username})
                  </span>
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
              <>
                <Button
                  size="sm"
                  onClick={() => handleSyncTargetPage(targetSyncPage)}
                  disabled={syncing || deepSyncing}
                  className="h-8 gap-1.5 bg-[#00522B] text-white hover:bg-[#003d20] text-xs font-semibold"
                >
                  <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
                  {syncing ? `Scraping ${targetSyncPage}...` : "Quick Sync"}
                </Button>

                <Button
                  size="sm"
                  onClick={handleDeepSync}
                  disabled={syncing || deepSyncing}
                  className="h-8 gap-1.5 bg-purple-700 text-white hover:bg-purple-800 text-xs font-semibold"
                  title="Scrape all available pages across pagination (multi-page crawler)"
                >
                  <SparklesIcon className={cn("size-3.5 text-amber-300", deepSyncing && "animate-spin")} />
                  {deepSyncing ? "Deep Crawling Pages..." : "Deep Scrape (All Pages)"}
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {stats.lastSyncedAt && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ClockIcon className="size-3" /> Last Synced: {new Date(stats.lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCmsData}
                disabled={loading}
                className="h-8 text-[11px] text-destructive hover:bg-destructive/10"
              >
                <Trash2Icon className="mr-1 size-3" /> Clear Cached Records
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Main Navigation Views Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeMainView === "subpages" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainView("subpages")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <DatabaseIcon className="size-3.5" />
            Scraped Subpages Tables
          </Button>

          <Button
            variant={activeMainView === "relations" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainView("relations")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <UsersIcon className="size-3.5 text-blue-500" />
            Student-Parent Directory
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {relationsSummary.totalStudents}
            </Badge>
          </Button>

          <Button
            variant={activeMainView === "revenue" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainView("revenue")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <CreditCardIcon className="size-3.5 text-emerald-500" />
            Finance Revenue & Invoices
            {revenueData.summary.pendingApprovalCount > 0 && (
              <Badge className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0 animate-pulse">
                {revenueData.summary.pendingApprovalCount} Needs Approval
              </Badge>
            )}
          </Button>

          <Button
            variant={activeMainView === "growth" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainView("growth")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <TrendingUpIcon className="size-3.5 text-purple-500" />
            Growth & Insights Dashboard
          </Button>
        </div>

        {/* Global Export Button for Active View */}
        <div className="flex items-center gap-2">
          {activeMainView === "subpages" && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCurrentTableToExcel}
              className="h-8 gap-1.5 text-xs font-medium border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Category to Excel
            </Button>
          )}
          {activeMainView === "relations" && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportRelationsToExcel}
              className="h-8 gap-1.5 text-xs font-medium border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Directory to Excel
            </Button>
          )}
          {activeMainView === "revenue" && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportRevenueToExcel}
              className="h-8 gap-1.5 text-xs font-medium border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Invoices to Excel
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: STUDENT-TO-PARENT RELATIONS DIRECTORY */}
      {/* ========================================================================= */}
      {activeMainView === "relations" && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="bg-muted/30">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Total Enrolled Students</span>
                <p className="text-xl font-bold tracking-tight text-foreground">{relationsSummary.totalStudents}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Parents Linked</span>
                <p className="text-xl font-bold tracking-tight text-foreground">{relationsSummary.linkedParents}</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Phone Reachable</span>
                <p className="text-xl font-bold tracking-tight text-foreground">{relationsSummary.withPhone}</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-500/5 border-purple-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400">Active Subscriptions</span>
                <p className="text-xl font-bold tracking-tight text-foreground">{relationsSummary.activeSubscriptions}</p>
              </CardContent>
            </Card>
          </div>

          {/* Directory Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] max-w-sm">
                <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search student, parent name, or phone..."
                  value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={relGradeFilter}
                onChange={(e) => setRelGradeFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
              >
                <option value="all">All Grades</option>
                <option value="Grade 5">Grade 5</option>
                <option value="Grade 6">Grade 6</option>
                <option value="Grade 7">Grade 7</option>
                <option value="Grade 8">Grade 8</option>
                <option value="Grade 9">Grade 9</option>
                <option value="Grade 10">Grade 10</option>
                <option value="Grade 11">Grade 11</option>
                <option value="Grade 12">Grade 12</option>
              </select>

              <div className="flex items-center gap-1.5 pl-2">
                <Switch id="rel-phone" checked={relPhoneOnly} onCheckedChange={setRelPhoneOnly} />
                <Label htmlFor="rel-phone" className="text-xs cursor-pointer">Has Phone Only</Label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {filteredRelations.length} of {relations.length} relations
              </span>
            </div>
          </div>

          {/* Relations Directory Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs">Student ID</TableHead>
                      <TableHead className="text-xs">Student Name</TableHead>
                      <TableHead className="text-xs">Grade</TableHead>
                      <TableHead className="text-xs">City</TableHead>
                      <TableHead className="text-xs">Linked Parent</TableHead>
                      <TableHead className="text-xs">Parent Phone (Quick Call)</TableHead>
                      <TableHead className="text-xs">Subscription</TableHead>
                      <TableHead className="text-xs">Link Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRelations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                          No matching student-parent relations found. Try syncing students, parents, and subscriptions.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRelations.map((rel) => (
                        <TableRow key={rel.studentId} className="text-xs hover:bg-muted/30">
                          <TableCell className="font-mono text-muted-foreground">#{rel.studentId}</TableCell>
                          <TableCell className="font-semibold text-foreground flex items-center gap-1.5">
                            <GraduationCapIcon className="size-3.5 text-primary shrink-0" />
                            {rel.studentName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-medium">
                              {rel.grade}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{rel.city}</TableCell>
                          <TableCell className="font-medium text-foreground">
                            {rel.parentName}
                          </TableCell>
                          <TableCell>
                            {rel.parentPhone ? (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${rel.parentPhone}`}
                                  className="flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 hover:underline font-semibold"
                                >
                                  <PhoneCallIcon className="size-3 text-emerald-600" />
                                  {rel.parentPhone}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => copyText(rel.parentPhone, `rel-${rel.studentId}`)}
                                  className="text-muted-foreground hover:text-foreground p-0.5"
                                  title="Copy Phone Number"
                                >
                                  {copiedKey === `rel-${rel.studentId}` ? (
                                    <CheckIcon className="size-3 text-emerald-600" />
                                  ) : (
                                    <CopyIcon className="size-3" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-[11px] italic">No phone linked</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px]",
                                rel.subscriptionStatus.toLowerCase() === "active"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {rel.subscriptionStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {rel.hasDirectLink ? "Direct Match" : "Subscription Contact"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: FINANCE REVENUE & INVOICE APPROVAL QUEUE */}
      {/* ========================================================================= */}
      {activeMainView === "revenue" && (
        <div className="space-y-4">
          {/* Revenue KPI Cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Total Settled Revenue</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  ETB {revenueData.summary.totalRevenue.toLocaleString()}
                </p>
                <span className="text-[10px] text-muted-foreground">{revenueData.summary.totalPaidCount} paid invoices</span>
              </CardContent>
            </Card>

            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Pending Approval</span>
                <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  ETB {revenueData.summary.pendingApprovalRevenue.toLocaleString()}
                </p>
                <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                  {revenueData.summary.pendingApprovalCount} bank receipts waiting review
                </span>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Average Ticket Value</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  ETB {revenueData.summary.averageInvoiceValue.toLocaleString()}
                </p>
                <span className="text-[10px] text-muted-foreground">Across standard plans</span>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Payment Channels</span>
                <div className="flex flex-wrap gap-1 pt-1">
                  {revenueData.byPaymentMethod.map((pm) => (
                    <Badge key={pm.method} variant="secondary" className="text-[9px] px-1.5 py-0">
                      {pm.method}: {pm.percentage}%
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Method Breakdown Bar */}
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <CreditCardIcon className="size-3.5 text-primary" /> Revenue by Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {revenueData.byPaymentMethod.map((m) => (
                  <div key={m.method} className="rounded-lg border p-3 space-y-1 bg-muted/20">
                    <span className="text-xs font-medium text-foreground">{m.method}</span>
                    <p className="text-base font-bold text-foreground">ETB {m.sum.toLocaleString()}</p>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{m.count} txns</span>
                      <span>{m.percentage}% share</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Invoices Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] max-w-sm">
                <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search invoice ID, student or reason..."
                  value={revSearch}
                  onChange={(e) => setRevSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={revMethodFilter}
                onChange={(e) => setRevMethodFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
              >
                <option value="all">All Payment Methods</option>
                <option value="Telebirr">Telebirr</option>
                <option value="CBE">CBE Birr / CBE</option>
                <option value="Bank Transfer">Bank Transfer (Manual)</option>
                <option value="Chapa">Chapa Online</option>
                <option value="Cash">Cash Deposit</option>
              </select>

              <select
                value={revStatusFilter}
                onChange={(e) => setRevStatusFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid & Settled</option>
                <option value="needs_approval">Needs Approval (Pending Bank Slips)</option>
              </select>
            </div>

            <span className="text-xs text-muted-foreground">
              Showing {filteredInvoices.length} invoices
            </span>
          </div>

          {/* Invoices Table with Approval Action */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs">Invoice #</TableHead>
                      <TableHead className="text-xs">Student</TableHead>
                      <TableHead className="text-xs">Plan</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Payment Method</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Action / Approval</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                          No invoices matching selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((inv) => (
                        <TableRow key={inv.id} className="text-xs hover:bg-muted/30">
                          <TableCell className="font-mono font-medium">#{inv.externalId}</TableCell>
                          <TableCell className="font-semibold text-foreground">{inv.student}</TableCell>
                          <TableCell className="text-muted-foreground">{inv.plan}</TableCell>
                          <TableCell className="font-bold text-foreground">{inv.amountFormatted}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {inv.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">{inv.date}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px]",
                                inv.status === "paid"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : inv.needsApproval
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {inv.status === "paid" ? "Paid" : inv.needsApproval ? "Needs Approval" : inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {inv.needsApproval ? (
                              <Button
                                size="sm"
                                onClick={() => handleApproveInvoice(inv.id)}
                                className="h-7 text-[11px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              >
                                <CheckCircleIcon className="size-3" /> Verify & Approve
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Verified</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: GROWTH & METRICS DASHBOARD */}
      {/* ========================================================================= */}
      {activeMainView === "growth" && (
        <div className="space-y-4">
          {/* Top Growth KPIs */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="bg-purple-500/5 border-purple-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400">Total Enrolled Students</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">{growthData.summary.totalStudents.toLocaleString()}</p>
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <TrendingUpIcon className="size-3" /> {growthData.summary.conversionRate}% active subscription rate
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Registered Parents</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">{growthData.summary.totalParents.toLocaleString()}</p>
                <span className="text-[11px] text-muted-foreground">Direct student guardians</span>
              </CardContent>
            </Card>

            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Active Subscriptions</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">{growthData.summary.activeSubscriptions.toLocaleString()}</p>
                <span className="text-[11px] text-muted-foreground">Currently active learning licenses</span>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Total Invoices Generated</span>
                <p className="text-2xl font-bold tracking-tight text-foreground">{growthData.summary.totalInvoices.toLocaleString()}</p>
                <span className="text-[11px] text-muted-foreground">Billing history records</span>
              </CardContent>
            </Card>
          </div>

          {/* Grade Distribution & Payment Method Visuals */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Grade Distribution */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <GraduationCapIcon className="size-3.5 text-primary" /> Student Enrollment by Grade
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {growthData.gradeDistribution.map((item) => (
                  <div key={item.grade} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{item.grade}</span>
                      <span className="text-muted-foreground font-mono">{item.count} students ({item.percentage}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#00522B]"
                        style={{ width: `${Math.max(5, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* City Demographics */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <BarChart3Icon className="size-3.5 text-blue-600" /> Geographic Student Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {growthData.cityDemographics.map((item) => (
                  <div key={item.city} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{item.city}</span>
                      <span className="text-muted-foreground font-mono">{item.count} ({item.percentage}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${Math.max(5, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: SCRAPED SUBPAGES TABLES */}
      {/* ========================================================================= */}
      {activeMainView === "subpages" && (
        <Tabs defaultValue={category} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-6 h-auto p-1">
            {allowedCategories.includes("students") && (
              <TabsTrigger value="students" className="text-xs py-2 gap-1.5">
                <GraduationCapIcon className="size-3.5 text-blue-600" /> Students
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {stats.studentsCount}
                </Badge>
              </TabsTrigger>
            )}
            {allowedCategories.includes("parents") && (
              <TabsTrigger value="parents" className="text-xs py-2 gap-1.5">
                <UsersIcon className="size-3.5 text-purple-600" /> Parents
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {stats.parentsCount}
                </Badge>
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscriptions") && (
              <TabsTrigger value="subscriptions" className="text-xs py-2 gap-1.5">
                <CreditCardIcon className="size-3.5 text-emerald-600" /> Subscriptions
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {stats.activeSubscriptionsCount}
                </Badge>
              </TabsTrigger>
            )}
            {allowedCategories.includes("invoices") && (
              <TabsTrigger value="invoices" className="text-xs py-2 gap-1.5">
                <FileTextIcon className="size-3.5 text-amber-600" /> Invoices
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {stats.invoicesCount}
                </Badge>
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-plans") && (
              <TabsTrigger value="subscription-plans" className="text-xs py-2 gap-1.5">
                <SparklesIcon className="size-3.5 text-rose-600" /> Plans
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {stats.plansCount}
                </Badge>
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-histories") && (
              <TabsTrigger value="subscription-histories" className="text-xs py-2 gap-1.5">
                <HistoryIcon className="size-3.5 text-teal-600" /> Histories
              </TabsTrigger>
            )}
          </TabsList>

          {/* Search, Status & Grade Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] max-w-sm">
                <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder={`Search ${category} records...`}
                  value={search}
                  onChange={handleSearchChange}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="paid">Paid</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>

              {(category === "students" || category === "subscriptions") && (
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
                >
                  <option value="all">All Grades</option>
                  <option value="Grade 5">Grade 5</option>
                  <option value="Grade 6">Grade 6</option>
                  <option value="Grade 7">Grade 7</option>
                  <option value="Grade 8">Grade 8</option>
                  <option value="Grade 9">Grade 9</option>
                  <option value="Grade 10">Grade 10</option>
                  <option value="Grade 11">Grade 11</option>
                  <option value="Grade 12">Grade 12</option>
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {filteredRecords.length} of {total} records
              </span>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSyncTargetPage(category)}
                  disabled={syncing}
                  className="h-8 gap-1 text-xs"
                >
                  <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
                  Sync Active Tab
                </Button>
              )}
            </div>
          </div>

          {/* Scraped Records Tables */}
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
                                  No records found in {cat}. Click &quot;Deep Scrape (All Pages)&quot; or &quot;Quick Sync&quot; to fetch live data.
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
                                    <TableCell>{r.title}</TableCell>
                                  )}
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedRecord(r)}
                                      className="h-7 text-[11px] px-2 text-primary hover:text-primary"
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
      )}

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
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            enabled ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-muted-foreground font-medium pb-1">Finance Department sees:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["invoices", "subscription-plans", "subscription-histories", "subscriptions", "students", "parents"] as LegacyCmsCategory[]).map((cat) => {
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
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            enabled ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
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
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
